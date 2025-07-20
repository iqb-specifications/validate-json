#!/usr/bin/env node
import { ValidationFactory, ValidationErrors } from "./validation.factory";

const schemaId = 'response';
const schemaVersion = '1.4';
const dataFolder = './test';

const fs = require('fs');
if (fs.existsSync(dataFolder)) {
    fs.readdirSync(dataFolder).forEach((file: string) => {
        ValidationFactory.validate(`${dataFolder}/${file}`, schemaId, schemaVersion).then(validationResult => {
            if (validationResult === 'VALID') {
                console.error(`${file}: \x1b[0;32m${validationResult}\x1b[0m`);
            } else {
                if (ValidationErrors.includes(validationResult)) {
                    console.error(`${file}: \x1b[0;31m${validationResult}\x1b[0m`);
                } else {
                    console.error(`${file}: \x1b[0;33m${validationResult}\x1b[0m`);
                }
                console.log(ValidationFactory.lastErrorMessage);
            }
        });
    });
} else {
    console.log(`\x1b[0;31mERROR\x1b[0m '${dataFolder}' not found`);
    process.exitCode = 1;
}
