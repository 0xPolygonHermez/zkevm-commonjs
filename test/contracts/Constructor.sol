// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

contract Constructor{

    uint256 public amount;

    constructor(uint _amount) {
        amount = _amount;   
    }

    fallback() external payable {}

    receive() external payable {}
    
    function payMe() public payable returns(bool success) {
        return true;
    }

    function fundtransfer(address payable destination) public{
        destination.transfer(amount);
    }
}