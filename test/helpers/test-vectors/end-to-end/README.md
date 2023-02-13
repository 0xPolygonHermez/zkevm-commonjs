# Additional test information
`e2e` test aims to check two functionalities related to the `zkEVMBridge`:
- `claimAsset`
- `bridgeAsset`

## Steps to build the `e2e` tests
- Go to [contracts repository](https://github.com/0xPolygonHermez/zkevm-contracts) and perform a deployment. One of the outcomes of the deployment will be a `genesis.json` file
- Copy the `genesis.json` file into the `e2e/state-transition.json` in the `genesis` object property
- Check `PolygonZkEVMBridge proxy` smart contract address in the `genesis` and copy it into each transaction. Therefore, `to` value in each transaction must match `PolygonZkEVMBridge proxy` address

## Notes
- `contractName` string under genesis property in `state-transition.json` is taken in order to load ABI interface to interact with contracts afterwards
- if a proxy is used, `contractName` should have the following pattern as a name: `${contractName} ${proxy}`
  - ABI `${contractName}` will be loaded then