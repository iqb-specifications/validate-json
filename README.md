[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![npm](https://img.shields.io/npm/v/%40iqbspecs%2Fvalidate-json)](https://www.npmjs.com/package/@iqbspecs/validate-json)

This script validates json data files using json schema. It will use a schema file published in iqb-specifications.github.io.

# Install

```bash
npm install @iqbspecs/validate-json --save-dev
```

Or add manually to the `package.json` and run `npm install`:

```json
    "devDependencies": {
      "@iqbspecs/validate-json": "^0.1.0"
    }
```
Sure the version of the package will change...


# Usage

To use it, define a new script in `package.json`:

```json
    "scripts": {
      "validate": "validate-json test-data response 1.4"
    },
```

Parameters:

1. **Folder** containing of the files. Recursive validation of subfolders is not supported (yet).
2. **ID** of the schema
3. (optional) **Version** <major>.<minor>; if not specified, the script expects the version to be a property `version` of the data file