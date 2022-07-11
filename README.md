# zkevm-commonjs
Javascript library implementing common utilities for polygon-hermez zkevm

[![Main CI](https://github.com/0xPolygonHermez/zkevm-commonjs/actions/workflows/main.yml/badge.svg)](https://github.com/0xPolygonHermez/zkevm-commonjs/actions/workflows/main.yml)

> **WARNING**: All code here is in WIP

## Usage
```
const zkevmCommon = require("@0xpolygonhermez/zkevm-commonjs");
```

You will find the following modules inside the package:
- `Constants`: zkevm global constants
- `contractUtils`: zkevm smart contract utils
- `Processor`: class to add transactions and process them
- `processorUtils`: utils used in processor
- `MemDb`: class implementing memory database
- `smtUtils`: sparse-merkle-tree utils
- `SMT`: class implementing the zkevm sparse-merkle-tree
- `stateUtils`: zkevm state utils
- `TmpSmtDB`: temporary sparse-merkle-tree database
- `utils`: general utils
- `ZkEVMDB`: class implementing the zkevm database
- `getPoseidon`: singleton to build poseidon just only once
- `MTBridge`: Merkle tree implementation used by the bridge
- `mtBridgeUtils`: Merkle tree bridge utils

## Test
```
npm run eslint & npm run test
```

## License
Copyright
Polygon `zkevm-commonjs` was developed by Polygon. While we plan to adopt an open source license, we haven’t selected one yet, so all rights are reserved for the time being. Please reach out to us if you have thoughts on licensing.
Disclaimer
This code has not yet been audited, and should not be used in any production systems.