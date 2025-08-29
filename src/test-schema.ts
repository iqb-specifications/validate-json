#!/usr/bin/env node
import { ValidationFactory, ValidationErrors } from "./validation.factory";

let dataFolder = process.argv[2];
let schemaFileName = process.argv[3];
const schemaId = "SCHEMA_ID";
const schemaVersion = "SCHEMA_VERSION";

const fs = require('fs');
let countValid = 0;
let countErrors = 0;
let countWarnings = 0;

async function evaluateFolder(folderName: string) {
    const allFiles = fs.readdirSync(folderName);
    for (const file of allFiles) {
        const validationResult = await ValidationFactory.validate(`${folderName}/${file}`, schemaId, schemaVersion);
        if (validationResult === 'VALID') {
            console.error(`${file}: \x1b[0;32m${validationResult}\x1b[0m`);
            countValid += 1;
        } else {
            if (ValidationErrors.includes(validationResult)) {
                console.error(`${file}: \x1b[0;31m${validationResult}\x1b[0m`);
                countErrors += 1;
            } else {
                console.error(`${file}: \x1b[0;33m${validationResult}\x1b[0m`);
                countWarnings += 1;
            }
            console.log(ValidationFactory.lastErrorMessage);
        }
    }
}

if (!dataFolder) dataFolder = '/test';
if (!schemaFileName) {
    const allRootFiles = fs.readdirSync('/');
    if (Array.isArray(allRootFiles) && allRootFiles.length > 0) {
        schemaFileName = allRootFiles.find(fileName => {
            if (!fileName || fileName.length < 13) return false;
            return fileName.substring(fileName.length - 12).toLowerCase() === '.schema.json';
        });
    }
}
console.error(dataFolder, schemaFileName);

if (fs.existsSync(dataFolder) && fs.existsSync(schemaFileName)) {
    const addSchemaResult = ValidationFactory.addLocalSchema(schemaFileName, schemaId, schemaVersion);
    if (addSchemaResult === 'VALID') {
        console.error(`${schemaFileName}: \x1b[0;32m${addSchemaResult}\x1b[0m`);
        evaluateFolder(dataFolder).then(()=> {
            console.error(`\nvalidation complete`);
            if (countErrors > 0) {
                console.error(`\x1b[0;31m${countErrors} errors\x1b[0m`);
                process.exitCode = 1;
            }
            if (countWarnings > 0) console.error(`\x1b[0;33m${countWarnings} warnings\x1b[0m`);
            if (countValid > 0) console.error(`\x1b[0;32m${countValid} valid files\x1b[0m`);
        })
    } else {
        if (ValidationErrors.includes(addSchemaResult)) {
            console.error(`${schemaFileName}: \x1b[0;31m${addSchemaResult}\x1b[0m`);
        } else {
            console.error(`${schemaFileName}: \x1b[0;33m${addSchemaResult}\x1b[0m`);
        }
        console.log(ValidationFactory.lastErrorMessage);
    }
} else {
    console.log(`\x1b[0;31mERROR\x1b[0m '${dataFolder}' not found`);
    process.exitCode = 1;
}
