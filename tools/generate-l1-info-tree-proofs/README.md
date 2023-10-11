# Tool to compute L1InfoTree smtProofs
- All commands are executed in the tool folder `./tools/generate-l1-info-tree-proofs`

## Setup generator
- copy `generator.example.json` to `generator.json`
```
cp generator.example.json generator.json
```
- Fill in all the smt leafs to build the smt

## Output
- add flag `--output`
- Script generates an output with the following name: `smt-output-${timestamp}.json` which contains
  - array of leafs sorted by its index
    - leaf data
    - value data
    - smtProof