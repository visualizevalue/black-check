// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "solady/src/tokens/ERC721.sol";

/**
 * @title MockERC721
 * @notice A simple mock ERC721 contract for testing
 */
contract MockERC721 is ERC721 {
    uint256 private _nextTokenId;

    function name() public pure override returns (string memory) {
        return "Mock NFT";
    }

    function symbol() public pure override returns (string memory) {
        return "MOCK";
    }

    function tokenURI(uint256) public pure override returns (string memory) {
        return "https://example.com/token";
    }

    function mint(address to) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(to, tokenId);
        return tokenId;
    }
}
