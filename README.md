# zkevm-commonjs
Javascript library implementing common utilities for zkevm

## Usage
```
const hermezCommons = require("@hermez-polygon/zkevm-commonjs");
```

You will find the following modules inside the package:
- `Constants`: zkevm global constants
- `contractUtils`: zkevm smart contract utils
- `Executor`: class to add transactions and process them
- `MemDb`: class implementing memory database
- `smtUtils`: sparse-merkle-tree utils
- `SMT`: class implementing the zkevm sparse-merkle-tree
- `stateUtils`: zkevm state utils
- `TmpSmtDB`: temporary sparse-merkle-tree database
- `utils`: general utils
- `ZkEVMDB`: class implementing the zkevm database

## Test
```
npm run eslint & npm run test
```

WARNING
All code here is in WIP

## License
`zkevm-commonjs` is part of the polygon-hermez project copyright 2022 PolygonHermez and published with AGPL-3 license. Please check the LICENSE file for more details.
