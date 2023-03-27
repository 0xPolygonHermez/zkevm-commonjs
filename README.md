# zkevm-commonjs

Javascript library implementing common utilities for polygon-hermez zkevm

[![Main CI](https://github.com/0xPolygonHermez/zkevm-commonjs/actions/workflows/main.yml/badge.svg)](https://github.com/0xPolygonHermez/zkevm-commonjs/actions/workflows/main.yml)

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

## Note

In order to test, the following private keys are being used. This keys are not meant to be used in any production environment:

- private key: `0x28b2b0318721be8c8339199172cd7cc8f5e273800a35616ec893083a4b32c02e`
  - address: `0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D`
- private key: `0x4d27a600dce8c29b7bd080e29a26972377dbb04d7a27d919adbb602bf13cfd23`
  - address: `0x4d5Cf5032B2a844602278b01199ED191A86c93ff`
- private key: `0x1d0722aff4b29780e9a78e0bf28d5e127fb276cfbb0c3eb6a0e1728401777f17`
  - address: `0xeB17ce701E9D92724AA2ABAdA7E4B28830597Dd9`
- private key: `0xd049e68efa0d85a3824c0b79f6817a986bb0cb3a075bcc2699118eca881d70ce`
  - address: `0x187Bd40226A7073b49163b1f6c2b73d8F2aa8478`
- private key: `0x0b929d50d7fda8155539e6befa96ff297e3e9ebce4d908f570310bdf774cb32b`
  - address: `0xabCcEd19d7f290B84608feC510bEe872CC8F5112`
- private key: `0xdfd01798f92667dbf91df722434e8fbe96af0211d4d1b82bbbbc8f1def7a814f`
  - address:`0xc949254d682d8c9ad5682521675b8f43b102aec4`

## License

### Copyright

Polygon `zkevm-commonjs` was developed by Polygon. While we plan to adopt an open source license, we haven’t selected one yet, so all rights are reserved for the time being. Please reach out to us if you have thoughts on licensing.

### Disclaimer

This code has not yet been audited, and should not be used in any production systems.
