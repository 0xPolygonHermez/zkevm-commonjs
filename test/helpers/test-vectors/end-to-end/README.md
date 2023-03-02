# Additional test information
`e2e` test aims to check two functionalities related to the `zkEVMBridge`:
- `claimAsset`
- `bridgeAsset`

## Steps to build the `e2e` tests
- Go to [contracts repository](https://github.com/0xPolygonHermez/zkevm-contracts) and perform a deployment. One of the outcomes of the deployment will be a `genesis.json` file
- Copy the `genesis.json` file into the `e2e/state-transition.json` in the `genesis` object property
- Check `PolygonZkEVMBridge proxy` smart contract address in the `genesis` and copy it into each transaction. Therefore, `to` value in each transaction must match `PolygonZkEVMBridge proxy` address
- Add in the genesis the following account:
```
{
  "balance": "0",
  "nonce": "3",
  "address": "0xc949254d682d8c9ad5682521675b8f43b102aec4",
  "pvtKey": "0xdfd01798f92667dbf91df722434e8fbe96af0211d4d1b82bbbbc8f1def7a814f"
}
```

## Notes
- `contractName` string under genesis property in `state-transition.json` is taken in order to load ABI interface to interact with contracts afterwards
- if a proxy is used, `contractName` should have the following pattern as a name: `${contractName} ${proxy}`
  - ABI `${contractName}` will be loaded then