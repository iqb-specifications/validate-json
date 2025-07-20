import Ajv from "ajv";

export type ValidationResult = 'VALID' | 'SCHEMA_NOT_FOUND' | 'SCHEMA_INVALID' | 'SCHEMA_COMPILE_ERROR' | 'INVALID' | 'ERROR_PARSING_SCHEMA' |
                            'FILE_NOT_FOUND' | 'FILE_PARSE_ERROR' | 'VALIDATION_ERROR';
export const ValidationErrors = ['INVALID', 'FILE_NOT_FOUND', 'FILE_PARSE_ERROR', 'VALIDATION_ERROR'];

export abstract class ValidationFactory {
    public static lastErrorMessage: unknown = null;
    private static invalidSchemas: Record<string, ValidationResult> = {};
    private static compiledSchemas: Record<string, any> = {};

    public static async validate(sourceFilename: string, schemaId: string, schemaVersion: string): Promise<ValidationResult> {
        let myReturn: ValidationResult = 'VALID';
        ValidationFactory.lastErrorMessage = '';

        const fs = require('fs');
        let dataObject = {};
        if (fs.existsSync(sourceFilename)) {
            let fileContent;
            try {
                fileContent = fs.readFileSync(sourceFilename, 'utf8');
            } catch (err) {
                myReturn = 'FILE_NOT_FOUND';
                ValidationFactory.lastErrorMessage = err;
                fileContent = null;
            }
            if (fileContent) {
                try {
                    dataObject = JSON.parse(fileContent);
                } catch (err) {
                    myReturn = 'FILE_PARSE_ERROR';
                    ValidationFactory.lastErrorMessage = err;
                }
            }
        } else {
            myReturn = 'FILE_NOT_FOUND';
        }

        if (myReturn === 'VALID') {
            const schemaKey = `${schemaId}@${schemaVersion}`;
            let compiledSchema;
            if (ValidationFactory.compiledSchemas[schemaKey]) {
                compiledSchema = ValidationFactory.compiledSchemas[schemaKey]
            } else if (ValidationFactory.invalidSchemas[schemaKey]) {
                myReturn = ValidationFactory.invalidSchemas[schemaKey];
            } else {
                const schemaUrl = `https://raw.githubusercontent.com/iqb-specifications/${schemaId}/refs/tags/${schemaVersion}/${schemaId}.schema.json`
                let fetchResponse: Response | null = null;
                let schemaFileContent = {};
                try {
                    fetchResponse = await fetch(schemaUrl);
                } catch (err) {
                    ValidationFactory.lastErrorMessage = err;
                    fetchResponse = null;
                    myReturn = 'SCHEMA_NOT_FOUND'
                }
                if (fetchResponse) {
                    try {
                        schemaFileContent = await fetchResponse.json();
                    } catch (err) {
                        ValidationFactory.lastErrorMessage = err;
                        schemaFileContent = '';
                        myReturn = 'SCHEMA_INVALID'
                    }
                    if (schemaFileContent) {
                        const ajv = new Ajv();
                        try {
                            compiledSchema = ajv.compile(schemaFileContent);
                            ValidationFactory.compiledSchemas[schemaKey] = compiledSchema;
                        } catch (err) {
                            ValidationFactory.lastErrorMessage = err;
                            compiledSchema = null;
                            myReturn = 'SCHEMA_COMPILE_ERROR'
                        }
                    }
                }
            }
            if (myReturn === 'VALID') {
                try {
                    const valid = compiledSchema ? compiledSchema(dataObject) : null;
                    if (!valid) {
                        myReturn = 'INVALID';
                        ValidationFactory.lastErrorMessage = compiledSchema ? compiledSchema.errors : 'error unknown';
                    }
                } catch (err) {
                    myReturn = 'VALIDATION_ERROR';
                    ValidationFactory.lastErrorMessage = err;
                }
            } else {
                ValidationFactory.invalidSchemas[schemaKey] = myReturn;
            }
        }
        return myReturn;
    }
}
