# Black Check

**An ERC20 token backed by Checks Originals NFTs**

Black Check (`$BLKCHK`) is an experimental digital artwork that creates a fungible token representation of [Checks Originals](https://etherscan.io/address/0x036721e5A769Cc48B3189EFbb9ccE4471E8A48B1) NFTs. The contract accepts Check NFTs and mints tokens proportional to their rarity, with a maximum supply of 1 token (1 × 10^18 wei).

> **⚠️ Important Notice**
>
> Participation in this project involves engagement with experimental digital artworks and is undertaken entirely at your own risk. This work does not constitute an offer to sell or the solicitation of an offer to buy any security, commodity, or financial instrument in any jurisdiction. It is a creative exploration of ownership, value, and representation, not an investment vehicle. No guarantees are made regarding liquidity, market value, or future performance.

## Token Allocations

The amount of `$BLKCHK` minted per Check depends on its divisor index (rarity):

| Check Type | Tokens Minted | Decimal       | Fraction     |
|------------|---------------|---------------|--------------|
| 80-check   | 0.000244140625| 1/4096        | 2^0 / 4096   |
| 40-check   | 0.00048828125 | 2/4096        | 2^1 / 4096   |
| 20-check   | 0.0009765625  | 4/4096        | 2^2 / 4096   |
| 10-check   | 0.001953125   | 8/4096        | 2^3 / 4096   |
| 5-check    | 0.00390625    | 16/4096       | 2^4 / 4096   |
| 4-check    | 0.0078125     | 32/4096       | 2^5 / 4096   |
| 1-check    | 0.015625      | 64/4096       | 2^6 / 4096   |

The formula: `tokens = (2^divisorIndex) / 4096` (with 18 decimals)

## How It Works

### Depositing Checks

To deposit a Check NFT and receive `$BLKCHK` tokens:

1. Transfer your Check NFT to the BlackCheck contract address
2. The contract automatically calculates and mints the appropriate amount of tokens based on the Check's rarity
3. Tokens are sent to your address

**Important**: Once deposited, your specific Check can be composited by anyone at any time. You may not be able to retrieve the exact same Check you deposited.

### Withdrawing Checks

To withdraw a specific Check NFT:

1. Call `withdraw(checkId)` with the ID of the Check you want
2. The contract burns the required amount of tokens from your balance
3. The Check NFT is transferred to you (if the contract owns it)

### Compositing Checks

Anyone can composite Checks held by the contract:

```solidity
composite(keepId, burnId)
```

- `keepId`: The token ID to keep (must be smaller than burnId)
- `burnId`: The token ID to burn
- This progresses the Checks toward becoming more rare

### Creating the Black Check

The ultimate goal is to create "one" - a single Black Check from 64 single-check tokens:

```solidity
one(tokenIds)
```

- Requires an array of 64 single-check token IDs
- The smallest ID must be at index 0
- All checks must be owned by the contract
- Calls the Checks contract's `infinity()` function
- The first check becomes the Black Check (1/∞)

## Contract Details

- **Address**: TBD (deploy to mainnet)
- **Token Name**: Black Check
- **Token Symbol**: $BLKCHK
- **Decimals**: 18
- **Max Supply**: 1.0 (1 × 10^18 wei)
- **Checks Contract**: `0x036721e5A769Cc48B3189EFbb9ccE4471E8A48B1`

## Development

### Running Tests

```shell
npx hardhat test
```

### Project Structure

- `contracts/BlackCheck.sol` - Main ERC20 contract
- `contracts/interfaces/` - Interface definitions
- `contracts/test/` - Foundry-compatible Solidity tests
- `contracts/mocks/` - Mock contracts for testing

## Art Statement

This project may or may not be notable. It explores the transformation of discrete digital objects into fungible representations, questioning the nature of ownership, rarity, and collective creation in the context of on-chain art.

---

*A VisualizeValue project*
