import Ajv from "ajv";
import * as fs from 'fs';
import * as path from 'path';

export type ValidationResult = 'VALID' | 'SCHEMA_NOT_FOUND' | 'SCHEMA_INVALID' | 'SCHEMA_COMPILE_ERROR' | 'INVALID' | 'ERROR_PARSING_SCHEMA' |
                            'FILE_NOT_FOUND' | 'FILE_PARSE_ERROR' | 'VALIDATION_ERROR';
export interface dataObjectWithVersion {
    version: string
}
export const ValidationErrors = ['INVALID', 'FILE_NOT_FOUND', 'FILE_PARSE_ERROR', 'VALIDATION_ERROR'];

export function findExternalUri(schemaFilename: string):string {
    let myReturn: ValidationResult = 'VALID';

    /**
     * Regular expression to match: "$ref": "http...until next quote
     */
    const refRegex: RegExp = /\$ref"\s*:\s*"http[^"]*"/g;

    /**
     * Store mapping of original $ref → replacement
     */
    const refMap = new Map<string, Response>();

    let counter = 1;
    // @ts-ignore
    const replacedContent = schemaFilename.replace(refRegex, async (match) => {
        const urlMatch = match.match(/"http[^"]*"/);
        if (!urlMatch) return match;

        const originalUrl = urlMatch[0].slice(1, -1); // Remove surrounding quotes

        // If we've seen this $ref before, reuse the same replacement
        if (refMap.has(originalUrl)) {
            const replacement = refMap.get(originalUrl)!;
        } else {
            // Create a unique replacement string
            // const replacement = `$ref": "REPLACED_REF_${counter++}`;
            const replacement = await fetchRefs(originalUrl);
            if (replacement !== null) {
                // @ts-ignore
                refMap.set(originalUrl, replacement);
            } else {
                myReturn = 'SCHEMA_NOT_FOUND';
            }
        }
    });
    // console.log(`TODO ES ${replacedContent}`)
    return replacedContent;
}

// @ts-ignore
export async function fetchRefs(originalUrl: string): Promise<string>{
    originalUrl = originalUrl.replace('github','raw.githubusercontent').replace('blob','refs/heads');
    // originalUrl = 'https://raw.githubusercontent.com/iqb-specifications/metadata-values/refs/heads/main/metadata-values.schema.json';
    let fetchResponse: Response | null = null;
    let schemaFileContent = {};
    try {
        fetchResponse = await fetch(originalUrl);
    } catch (err) {
        ValidationFactory.lastErrorMessage = err;
        fetchResponse = null;
    }
    if (fetchResponse) {
        try {
            schemaFileContent = await fetchResponse.json();
        } catch (err) {
            ValidationFactory.lastErrorMessage = err;
            schemaFileContent = '';
        }
        if (schemaFileContent) {
            console.log(JSON.stringify(schemaFileContent));
            return JSON.stringify(schemaFileContent);
        }
    }else {
        return "";
    }
}

export abstract class ValidationFactory {
    public static lastErrorMessage: unknown = null;
    private static invalidSchemas: Record<string, ValidationResult> = {};
    private static compiledSchemas: Record<string, any> = {};

    public static addLocalSchema(schemaFilename: string, schemaId: string, schemaVersion: string): ValidationResult {
        let myReturn: ValidationResult = 'VALID';
        const fs = require('fs');
        if (fs.existsSync(schemaFilename)) {
            let compiledSchema = null;
            let fileContent;
            try {
                fileContent = fs.readFileSync(schemaFilename, 'utf8');
            } catch (err) {
                ValidationFactory.lastErrorMessage = err;
                fileContent = null;
            }
            if (fileContent) {
               // console.log(`HOLA mi tipo es ${(fileContent)}`);
                findExternalUri(fileContent.toString());
                const ajv = new Ajv();
                try {
                    const dataObject = JSON.parse(fileContent);
                    compiledSchema = ajv.compile(dataObject);
                    ValidationFactory.compiledSchemas[`${schemaId}@${schemaVersion}`] = compiledSchema;
                } catch (err) {
                    myReturn = 'SCHEMA_COMPILE_ERROR';
                    ValidationFactory.lastErrorMessage = err;
                }
            }
        } else {
            myReturn = 'SCHEMA_NOT_FOUND'
        }
        return myReturn;
    }

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
            if (!schemaVersion) schemaVersion = (dataObject as dataObjectWithVersion).version;
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
                    console.log(`1 ${fetchResponse}`)
                } catch (err) {
                    ValidationFactory.lastErrorMessage = err;
                    fetchResponse = null;
                    myReturn = 'SCHEMA_NOT_FOUND'
                }
                if (fetchResponse) {
                    try {
                        schemaFileContent = await fetchResponse.json();
                        console.log(`111111111 ${JSON.stringify(schemaFileContent)}`)
                    } catch (err) {
                        ValidationFactory.lastErrorMessage = err;
                        schemaFileContent = '';
                        myReturn = 'SCHEMA_INVALID'
                    }
                    if (schemaFileContent) {
                        schemaFileContent = findExternalUri(schemaFileContent.toString());
                        console.log(`Paso por aqui ${schemaFileContent}` );
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
