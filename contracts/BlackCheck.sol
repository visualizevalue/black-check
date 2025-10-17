// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "solady/src/tokens/ERC20.sol";
import "./interfaces/IChecks.sol";
import "./interfaces/IERC721Receiver.sol";

/**
 * @title  BlackCheck
 * @author VisualizeValue
 * @notice Participation in this project involves engagement with experimental digital artworks
 *         and is undertaken entirely at your own risk. This work does not constitute an offer to sell
 *         or the solicitation of an offer to buy any security, commodity, or financial instrument
 *         in any jurisdiction. It is a creative exploration of ownership, value, and representation,
 *         not an investment vehicle. no guarantees are made regarding liquidity, market value,
 *         or future performance.
 *         By interacting, you acknowledge that any value or meaning assigned to these assets
 *         is purely subjective and interpretive, and that you are solely responsible
 *         for compliance with all applicable laws in your region.
 *         ---------
 *         This project may or may not be notable.
 */
contract BlackCheck is ERC20, IERC721Receiver {
    /// @notice The Checks Originals contract
    IChecks public constant CHECKS = IChecks(0x036721e5A769Cc48B3189EFbb9ccE4471E8A48B1);

    /// @notice 1 / ∞ (This is one artifact)
    uint256 public constant MAX_SUPPLY = 1 * 10**18;

    /// @notice Emitted when a Check is deposited
    event CheckDeposited(address indexed depositor, uint256 indexed checkId, uint256 amount);

    /// @notice Emitted when a Check is withdrawn
    event CheckWithdrawn(address indexed withdrawer, uint256 indexed checkId, uint256 amount);

    /// @notice Emitted when Checks are composited
    event ChecksComposited(uint256 indexed keepId, uint256 indexed burnId, address compositor);

    /// @notice Emitted when the Black Check is created
    event One(uint256 indexed blackCheckId, address creator);

    error InvalidOrder();
    error MaxSupplyExceeded();
    error OnlyChecksContract();
    error NoEthAccepted();

    /// @notice Returns the name of the token
    function name() public pure override returns (string memory) {
        return "Black Check";
    }

    /// @notice Returns the symbol of the token
    function symbol() public pure override returns (string memory) {
        return "$BLKCHK";
    }

    /// @notice Deposit Checks Originals to receive $BLKCHK tokens. Note the checks held
    ///         by this contract can be composited by anybody at any time so you
    ///         might not be able to retrieve your check.
    /// @dev This function is called by the Checks contract when a Check is transferred to this contract
    function onERC721Received(
        address /* operator */,
        address from,
        uint256 tokenId,
        bytes calldata /* data */
    ) external override returns (bytes4) {
        // Only accept Checks NFTs
        if (msg.sender != address(CHECKS)) revert OnlyChecksContract();

        // Calculate mint amount
        uint256 mintAmount = calculateMintAmount(CHECKS.getCheck(tokenId).stored.divisorIndex);

        // Check max supply
        if (totalSupply() + mintAmount > MAX_SUPPLY) revert MaxSupplyExceeded();

        // Mint tokens to the depositor
        _mint(from, mintAmount);

        emit CheckDeposited(from, tokenId, mintAmount);

        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Withdraw a specific Check NFT by burning the corresponding amount of tokens
    /// @param checkId The ID of the Check to withdraw
    function withdraw(uint256 checkId) external {
        // Get the check's divisor index
        uint256 burnAmount = calculateMintAmount(CHECKS.getCheck(checkId).stored.divisorIndex);

        // Burn tokens (reverts on insufficient balance)
        _burn(msg.sender, burnAmount);

        // Transfer the Check NFT to the withdrawer (will revert if we don't own it)
        CHECKS.safeTransferFrom(address(this), msg.sender, checkId);

        emit CheckWithdrawn(msg.sender, checkId, burnAmount);
    }

    /// @notice Composite two checks held by this contract
    /// @param keepId The token ID to keep
    /// @param burnId The token ID to burn
    /// @dev Anyone can call this to composite towards the Black Check
    function composite(uint256 keepId, uint256 burnId) external {
        // Enforce that keepId is always smaller than burnId
        if (keepId > burnId) revert InvalidOrder();

        // Perform the composite (Checks contract validates ownership and compatibility)
        CHECKS.composite(keepId, burnId, false);

        emit ChecksComposited(keepId, burnId, msg.sender);
    }

    /// @notice Create a black check from 64 single-check tokens
    /// @param tokenIds Array of 64 single-check token IDs, with the smallest ID at index 0
    /// @dev Anyone can call this. The first check in the list will survive as the Black Check.
    function one(uint256[] calldata tokenIds) external {
        uint256 id = tokenIds[0];

        // Verify that the id is the smallest
        for (uint256 i = 1; i < 64; i++) {
            if (tokenIds[i] < id) revert InvalidOrder();
        }

        // Call infinity on the Checks contract (validates single checks and ownership)
        CHECKS.infinity(tokenIds);

        emit One(id, msg.sender);
    }

    /// @dev Calculate the amount of tokens to mint for a given check
    /// @param divisorIndex The divisor index of the check (0-7)
    /// @return The amount of tokens (with 18 decimals)
    function calculateMintAmount(uint8 divisorIndex) private pure returns (uint256) {
        // Black check (divisorIndex 7) represents the entire minted token supply.
        if (divisorIndex == 7) return MAX_SUPPLY;

        // For divisorIndex 0-6, use the exponential formula
        return ((1 << divisorIndex) * 10**18) / 4096;
    }

    /// @notice Reject all ETH transfers
    receive() external payable {
        revert NoEthAccepted();
    }

    /// @notice Reject all ETH transfers
    fallback() external payable {
        revert NoEthAccepted();
    }
}
