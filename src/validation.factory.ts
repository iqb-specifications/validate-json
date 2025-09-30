import Ajv from "ajv";

export type ValidationResult =
    'VALID'
    | 'SCHEMA_NOT_FOUND'
    | 'SCHEMA_INVALID'
    | 'SCHEMA_COMPILE_ERROR'
    | 'INVALID'
    | 'ERROR_PARSING_SCHEMA'
    |
    'FILE_NOT_FOUND'
    | 'FILE_PARSE_ERROR'
    | 'VALIDATION_ERROR';

export interface dataObjectWithVersion {
    version: string
}

export const ValidationErrors = ['INVALID', 'FILE_NOT_FOUND', 'FILE_PARSE_ERROR', 'VALIDATION_ERROR'];

const suffix = ['_', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
let num = 0;

export function hasExternalUri(schemaContent: string): boolean {
    const refRegex: RegExp = /\$ref"\s*:\s*"http[^"]*"/g;

    // SAFE: Collect all matches using RegExp.exec
    const matches: RegExpMatchArray[] = [];
    let match: RegExpExecArray | null;

    while ((match = refRegex.exec(schemaContent)) !== null) {
        matches.push(match);
    }
    return (matches.length > 0);
}

async function findExternalUri(schemaContent: string, num: number): Promise<string> {
    let recursive = false;
    let myReturn: ValidationResult = 'VALID';
    const refRegex: RegExp = /\$ref"\s*:\s*"http[^"]*"/g;
    let additionalDef: Record<string, string> = {};
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
                num = num + 1;
                const [replacement, endDefs] = await fetchRefs(originalUrl, num);

                // checks we have to call this function again
                if (hasExternalUri(JSON.stringify(replacement)) || hasExternalUri(JSON.stringify(endDefs))) {
                    recursive = true;
                }

                if (replacement !== null) {
                    refMap.set(originalUrl, replacement);
                    // Concatenate additional defs at the end of the schema
                    additionalDef = {...additionalDef, ...endDefs};
                } else {
                    myReturn = 'SCHEMA_NOT_FOUND';
                    refMap.set(originalUrl, match[0]);
                }
            }
        });

        await Promise.all(fetchPromises);
        let schema = schemaContent.replace(refRegex, (match) => {
            const urlMatch = match.match(/"http[^"]*"/);
            if (!urlMatch) return match;

            const originalUrl = urlMatch[0].slice(1, -1);

            return JSON.stringify(refMap.get(originalUrl)).substring(2, JSON.stringify(refMap.get(originalUrl)).length - 1) ?? match;
        });
        // Add additional defs to the schema:
        schema = addToAProperty(JSON.parse(schema), '$defs', JSON.stringify(additionalDef));
        if (recursive) {
            return findExternalUri(JSON.stringify(schema), num);
        } else
            return JSON.stringify(schema);
    } else {
        return schemaContent;
    }
}

async function fetchRefs(originalUrl: string, position: number): Promise<any> {
    originalUrl = originalUrl.replace('github', 'raw.githubusercontent').replace('blob', 'refs/heads');
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
            // Add suffix to all $ref
            schemaFileContent = updateRefs(schemaFileContent, suffix[position]);

            // Delete properties id and schema
            schemaFileContent = withoutProperty(schemaFileContent, '$id');
            schemaFileContent = withoutProperty(schemaFileContent, '$schema');

            // Get the defs
            const updatedDefs = returnProperty(schemaFileContent, '$defs');
            const updatedDefsWithSuffix: Record<string, any> = {};

            // Update the keys
            for (const key in updatedDefs) {
                if (updatedDefs.hasOwnProperty(key)) {
                    const newKey = key + "_" + suffix[position];
                    updatedDefsWithSuffix[newKey] = updatedDefs[key];
                }
            }

            // Delete $defs from the actual schema
            schemaFileContent = withoutProperty(schemaFileContent, '$defs');
            return [schemaFileContent, updatedDefsWithSuffix];
        }
    } else {
        return '';
    }
}


// @ts-ignore
function withoutProperty(obj, property) {
    const {[property]: unused, ...rest} = obj;
    return rest;
}

// @ts-ignore
function returnProperty(obj, property) {
    const {[property]: unused } = obj;
    return unused;
}

// @ts-ignore
function addToAProperty(obj, property, value) {
    obj[property] = {...obj[property], ...JSON.parse(value)};
    return obj;
}

type JSONValue = string | number | boolean | JSONObject | JSONArray;

interface JSONObject {
    [key: string]: JSONValue;
}

interface JSONArray extends Array<JSONValue> {
}

/**
 * Recursively traverse the JSON and update all $ref values
 * by inserting a string into the middle of the path.
 */
function updateRefs(obj: JSONValue, insertStr: string): JSONValue {
    if (Array.isArray(obj)) {
        return obj.map(item => updateRefs(item, insertStr));
    } else if (typeof obj === 'object' && obj !== null) {
        const newObj: JSONObject = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key === '$ref' && typeof value === 'string') {
                if (!value.includes('http'))
                    newObj[key] = modifyRef(value, insertStr);
                else
                    newObj[key] = obj[key];
            } else {
                newObj[key] = updateRefs(value, insertStr);
            }
        }
        return newObj;
    }
    return obj;
}

/**
 * Insert a string into the middle of a $ref path.
 * For example: "#/components/schemas/User" → "#/components/schemas/UserX"
 */
function modifyRef(refPath: string, insertStr: string): string {
    const parts = refPath.split('/');
    if (parts.length > 2) {
        // Insert before the last part (i.e., before "User")
        parts[parts.length - 1] += "_" + insertStr;
    }
    return parts.join('/');
}


export abstract class ValidationFactory {
    public static lastErrorMessage: unknown = null;
    private static invalidSchemas: Record<string, ValidationResult> = {};
    private static compiledSchemas: Record<string, any> = {};

    public static addLocalSchema(schemaFilename: string, schemaId: string, schemaVersion: string): ValidationResult{
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
            const ajv = new Ajv();
            if (hasExternalUri(fileContent) && fileContent) {
                Promise.resolve(findExternalUri(fileContent.toString(), num))
                    .then(async (value) => {
                try {
                    const dataObject = JSON.parse(value);
                    compiledSchema = ajv.compile(dataObject);
                    ValidationFactory.compiledSchemas[`${schemaId}@${schemaVersion}`] = compiledSchema;
                } catch (err) {
                    myReturn = 'SCHEMA_COMPILE_ERROR';
                    ValidationFactory.lastErrorMessage = err;
                }
                });
            }
            else if (fileContent){
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

