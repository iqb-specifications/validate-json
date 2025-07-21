#!/usr/bin/env node
import { ValidationFactory, ValidationErrors } from "./validation.factory";

const schemaId = 'response';
const schemaVersion = '1.4';
const dataFolder = './test';

const fs = require('fs');
let countValid = 0;
let countErrors = 0;
let countWarnings = 0;

async function evaluateFolder(folderName: string) {
    const allFiles = await fs.readdirSync(folderName);
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

if (fs.existsSync(dataFolder)) {
    evaluateFolder(dataFolder).then(()=> {
        if (countErrors > 0) {
            console.error(`\x1b[0;31m${countErrors} errors\x1b[0m`);
            process.exitCode = 1;
        }
        if (countWarnings > 0) console.error(`\x1b[0;33m${countWarnings} warnings\x1b[0m`);
        if (countValid > 0) console.error(`\x1b[0;32m${countValid} valid files\x1b[0m`);
    })
} else {
    console.log(`\x1b[0;31mERROR\x1b[0m '${dataFolder}' not found`);
    process.exitCode = 1;
}
