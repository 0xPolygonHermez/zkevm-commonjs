# update @ethereumjs library to add:
# - add customTouched seet for handling updated accounts between checkpoints

cp config/baseStateManager.js node_modules/@ethereumjs/vm/dist/state/baseStateManager.js

# update @ethereumjs library to use CheckpointTrie imnstead of SecureTrie
# SecureTrie does a hash of the key to insert in the trie
# if storage is dumped and used again, the original key is hashed twice

SCRIPT=$(readlink -f "$0")
BUILD_CONFIG_HOME=$(dirname "$SCRIPT")

cd ${BUILD_CONFIG_HOME}/..

TOREPLACE="SecureTrie"
NEW="CheckpointTrie"

# node
sed -i'' -e "s|$TOREPLACE|$NEW|" node_modules/@ethereumjs/vm/dist/index.d.ts
sed -i'' -e "s|$TOREPLACE|$NEW|" node_modules/@ethereumjs/vm/dist/index.js
sed -i'' -e "s|$TOREPLACE|$NEW|" node_modules/@ethereumjs/vm/dist/state/stateManager.d.ts
sed -i'' -e "s|$TOREPLACE|$NEW|" node_modules/@ethereumjs/vm/dist/state/stateManager.js

# browser
sed -i'' -e "s|$TOREPLACE|$NEW|" node_modules/@ethereumjs/vm/dist.browser/index.d.ts
sed -i'' -e "s|$TOREPLACE|$NEW|" node_modules/@ethereumjs/vm/dist.browser/index.js
sed -i'' -e "s|$TOREPLACE|$NEW|" node_modules/@ethereumjs/vm/dist.browser/state/stateManager.d.ts
sed -i'' -e "s|$TOREPLACE|$NEW|" node_modules/@ethereumjs/vm/dist.browser/state/stateManager.js