// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

contract BlockInfo {

    address public testCoinbase;
    bytes32 public testBlockhash;
    uint256 public testTimestamp;
    uint256 public testBatchNumber;
    uint256 public testDifficulty;
    uint256 public testGasLimit;
    uint256 public testChainId;

    function getTimestamp() public {
        testTimestamp = block.timestamp;
    }

    function getCoinbase() public {
        testCoinbase = block.coinbase;
    }

    function getBatchNumber() public {
        testBatchNumber = block.number;
    }

    function getDifficulty() public {
        testDifficulty = block.difficulty;
    }

    function getGasLimit() public {
        testGasLimit = block.gaslimit;
    }

    function getChainId() public {
        testChainId = block.chainid;
    }
    
    function getBlockhash(uint blockNumber) public {
        testBlockhash = blockhash(blockNumber);
    }
}