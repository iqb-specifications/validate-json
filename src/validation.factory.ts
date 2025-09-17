import Ajv from "ajv";

export type ValidationResult = 'VALID' | 'SCHEMA_NOT_FOUND' | 'SCHEMA_INVALID' | 'SCHEMA_COMPILE_ERROR' | 'INVALID' | 'ERROR_PARSING_SCHEMA' |
                            'FILE_NOT_FOUND' | 'FILE_PARSE_ERROR' | 'VALIDATION_ERROR';
export interface dataObjectWithVersion {
    version: string
}
export const ValidationErrors = ['INVALID', 'FILE_NOT_FOUND', 'FILE_PARSE_ERROR', 'VALIDATION_ERROR'];

export function hasExternalUri(schemaContent:string):boolean {
    const refRegex: RegExp = /\$ref"\s*:\s*"http[^"]*"/g;

    // SAFE: Collect all matches using RegExp.exec
    const matches: RegExpMatchArray[] = [];
    let match: RegExpExecArray | null;

    while ((match = refRegex.exec(schemaContent)) !== null) {
        matches.push(match);
    }
    return (matches.length>0);
}

export async function findExternalUri(schemaContent: string): Promise<string> {
    let myReturn: ValidationResult = 'VALID';
    const refRegex: RegExp = /\$ref"\s*:\s*"http[^"]*"/g;
    const refMap = new Map<string, string>();

    // SAFE: Collect all matches using RegExp.exec
    const matches: RegExpMatchArray[] = [];
    let match: RegExpExecArray | null;

    while ((match = refRegex.exec(schemaContent)) !== null) {
        matches.push(match);
    }
    if (matches.length > 0) {
        // Fetch and prepare replacements
        const fetchPromises = matches.map(async (match) => {
            const urlMatch = match[0].match(/"http[^"]*"/);
            if (!urlMatch) return;

            const originalUrl = urlMatch[0].slice(1, -1);

            if (!refMap.has(originalUrl)) {
                const replacement = await fetchRefs(originalUrl);
                if (replacement !== null) {
                    refMap.set(originalUrl, replacement);
                } else {
                    myReturn = 'SCHEMA_NOT_FOUND';
                    refMap.set(originalUrl, match[0]);
                }
            }
        });

        await Promise.all(fetchPromises);

        return schemaContent.replace(refRegex, (match) => {
            const urlMatch = match.match(/"http[^"]*"/);
            if (!urlMatch) return match;

            const originalUrl = urlMatch[0].slice(1, -1);
            return JSON.stringify(refMap.get(originalUrl)).substring(2, JSON.stringify(refMap.get(originalUrl)).length - 1) ?? match;
        });
    }else
    {
        return schemaContent;
    }
}


export async function fetchRefs(originalUrl: string): Promise<any>{
    originalUrl = originalUrl.replace('github','raw.githubusercontent').replace('blob','refs/heads');
    let fetchResponse: Response | null;
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
            return schemaFileContent;
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
                const ajv = new Ajv();
                if (hasExternalUri(fileContent)) {
                    Promise.resolve(findExternalUri(fileContent.toString()))
                        .then((value) => {
                            const dataObject = JSON.parse(value);
                            compiledSchema = ajv.compile(dataObject);
                            ValidationFactory.compiledSchemas[`${schemaId}@${schemaVersion}`] = compiledSchema;
                            // Create a new schema with contains the no external refs
                            fs.writeFile(schemaFilename, JSON.stringify(dataObject, null, 2), (err_write: Error) => {
                                if (err_write) {
                                    console.log(`Error writing file ${schemaFilename}`, err_write);
                                } else {
                                    console.log(`Writing ref_${schemaFilename}`);
                                }
                            });
                        }).catch((err) => {
                        myReturn = 'SCHEMA_COMPILE_ERROR';
                        ValidationFactory.lastErrorMessage = err;
                    });
                }else{
                    try {
                        const dataObject = JSON.parse(fileContent);
                        compiledSchema = ajv.compile(dataObject);
                        ValidationFactory.compiledSchemas[`${schemaId}@${schemaVersion}`] = compiledSchema;
                    } catch (err) {
                        myReturn = 'SCHEMA_COMPILE_ERROR';
                        ValidationFactory.lastErrorMessage = err;
                    }
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
                let fetchResponse: Response | null;
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
