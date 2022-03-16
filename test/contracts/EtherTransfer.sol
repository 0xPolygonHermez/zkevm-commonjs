// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

contract Ethertransfer{

    fallback() external payable {}

    receive() external payable {}
    
    function payMe() public payable returns(bool success) {
        return true;
    }

    function fundtransfer(address payable destination, uint256 amount) public{
        destination.transfer(amount);
    }
}