# Black Check Whitepaper

## Abstract

Black Check ($BLKCHK) is an experimental ERC20 token that creates a fungible representation of Checks Originals NFTs through a novel deposit and exchange mechanism. Built on Ethereum, the protocol enables participants to transform discrete NFTs into liquid tokens while maintaining a path back to specific artworks. With a maximum supply of exactly 1 token, Black Check explores themes of scarcity, fungibility, and collective creation within the established Checks ecosystem.

## Table of Contents

1. [Introduction](#introduction)
2. [The Checks Ecosystem](#the-checks-ecosystem)
3. [Protocol Overview](#protocol-overview)
4. [Tokenomics](#tokenomics)
5. [Core Mechanics](#core-mechanics)
6. [Technical Architecture](#technical-architecture)
7. [Game Theory & Economics](#game-theory--economics)
8. [Risks & Considerations](#risks--considerations)
9. [Conclusion](#conclusion)

---

## Introduction

Black Check represents a new primitive in the intersection of NFTs and fungible tokens. Rather than creating a traditional fractional ownership model, Black Check establishes a dynamic system where NFT deposits create token supply, and token burns enable NFT redemption. The protocol is permissionless, allowing any participant to deposit Checks, exchange tokens for specific NFTs, or composite Checks held by the contract.

The ultimate artistic goal is the creation of "1/∞" — a single Black Check formed from the composition of 64 individual Checks — representing the convergence of 4,096 original checks into one singular artifact.

### Key Characteristics

- **Maximum Supply**: 1.0 $BLKCHK (1 × 10^18 wei)
- **Backed by Art**: Each token represents a fractional claim on Checks Originals NFTs
- **Permissionless Compositing**: Anyone can composite Checks held by the contract
- **Asymmetric Liquidity**: Deposits are permanent; redemption depends on available inventory
- **On-Chain Artwork**: The protocol itself is an artistic exploration, not a financial instrument

---

## The Checks Ecosystem

### Origins

Checks Originals (`0x036721e5A769Cc48B3189EFbb9ccE4471E8A48B1`) and Checks Editions (`0x34eEBEE6942d8Def3c125458D1a86e0A897fd6f9`) are generative art projects by VisualizeValue that have become significant cultural artifacts in the NFT space. Over the past three years, the Checks ecosystem has traded over **94,000 ETH**, demonstrating sustained community engagement and cultural relevance.

### The Checks Mechanism

Checks Originals implements a unique compositing mechanism:

- **Initial State**: Each Check NFT begins with 80 individual checks
- **Compositing**: Two compatible Checks can be composited, burning one and doubling the check count on the other
- **Progression**: 80 → 40 → 20 → 10 → 5 → 4 → 1
- **Infinity**: 64 single-check NFTs can be combined to create the "Black Check" (1/∞)
- **Rarity Tiers**: Determined by the checks count (80, 40, 20, 10, 5, 4, 1, or ∞), representing the number of compositing generations

### Check Structure

Each Check contains on-chain metadata including:

```solidity
struct StoredCheck {
    uint16[6] composites;   // Composition history
    uint8[5] colorBands;    // Visual properties
    uint8[5] gradients;     // Generation-specific gradients
    uint8 divisorIndex;     // Compositing generation (0-7)
    uint32 epoch;           // Revelation epoch
    uint16 seed;            // Unique identifier
    uint24 day;             // Creation timestamp
}
```

The checks count (determined by the `divisorIndex`) determines both the visual rarity and the $BLKCHK token allocation.

---

## Protocol Overview

### Philosophy

Black Check is positioned as **experimental digital artwork**, not a financial product. Participation involves:

- **Creative Acts**: Minting, exchanging, and compositing are artistic expressions
- **Irreversible Transformations**: Checks deposited may be composited by others
- **Collective Creation**: The community works together toward the ultimate Black Check
- **Voluntary Participation**: All interactions are at-will and at-risk

### Design Goals

1. **Create Liquidity**: Transform illiquid NFTs into fungible tokens
2. **Enable Price Discovery**: Establish market-driven valuation for different Check rarities
3. **Facilitate Compositing**: Accelerate the journey toward 1/∞
4. **Explore Ownership**: Question the nature of digital ownership and fungibility
5. **Maintain Optionality**: Allow participants to exchange back to specific NFTs

---

## Tokenomics

### Supply Model

The maximum supply is **exactly 1 $BLKCHK token** (1 × 10^18 wei with 18 decimals). This supply would only be reached if a Black Check is created via the contract.

### Allocation Formula

Token allocation per Check is calculated based on the checks count:

| Checks Count | Tokens Minted  | Fraction of Supply |
| ------------ | -------------- | ------------------ |
| 80           | 0.000244140625 | 1/4096 = 0.0244%   |
| 40           | 0.00048828125  | 2/4096 = 0.0488%   |
| 20           | 0.0009765625   | 4/4096 = 0.0977%   |
| 10           | 0.001953125    | 8/4096 = 0.1953%   |
| 5            | 0.00390625     | 16/4096 = 0.3906%  |
| 4            | 0.0078125      | 32/4096 = 0.7813%  |
| 1            | 0.015625       | 64/4096 = 1.5625%  |
| ∞            | 1.0            | 4096/4096 = 100%   |

### Mathematical Properties

The allocation follows an exponential progression where each compositing generation doubles the token value:

- **80-check → 40-check**: 2x tokens
- **40-check → 20-check**: 2x tokens
- **20-check → 10-check**: 2x tokens
- And so on...

This creates a direct mathematical relationship between the artistic progression of Checks and their economic value in the $BLKCHK system.

### Maximum Possible Supply

The contract accepts a maximum of 4096 80-check equivalents to mint the maximum possible supply of 1 $BLKCHK.

---

## Core Mechanics

### 1. Depositing Checks

Participants can deposit Checks NFTs to receive $BLKCHK tokens through two methods:

#### Method A: Direct Transfer (safeTransferFrom)

```solidity
CHECKS.safeTransferFrom(msg.sender, blackCheckAddress, tokenId);
```

The contract's `onERC721Received` hook automatically:

1. Validates the NFT is from the Checks contract
2. Calculates token allocation based on the checks count
3. Mints tokens to the depositor
4. Emits a `Mint` event

#### Method B: Approval + Mint Function

```solidity
// 1. Approve the contract
CHECKS.setApprovalForAll(blackCheckAddress, true);

// 2. Anyone calls mint (tokens go to owner)
blackCheck.mint([tokenId1, tokenId2, tokenId3]);
```

The `mint` function:

- Accepts an array of Check IDs for batch processing
- Verifies approval for each Check
- Transfers NFTs to the contract
- Mints tokens to the **NFT owner** (not the caller)
- Allows permissionless processing of approved Checks

**Critical Note**: Deposited Checks become owned by the contract and can be composited by anyone at any time. You may not be able to retrieve your specific Check.

### 2. Exchanging Tokens for Checks

Participants can burn $BLKCHK tokens to redeem specific Checks held by the contract:

```solidity
blackCheck.exchange(checkId);
```

The exchange process:

1. Calculates required burn amount based on the Check's checks count
2. Burns tokens from msg.sender (reverts on insufficient balance)
3. Transfers the Check NFT to msg.sender (reverts if contract doesn't own it)
4. Emits an `Exchange` event

**Exchange Economics**: The burn amount equals the original mint amount for that Check's checks count. This creates interesting dynamics:

- A composited Check (e.g., 40 checks) requires burning MORE tokens than the original deposited 80-check
- Participants must acquire additional tokens or hope the contract holds less-composited Checks
- The exchange mechanism creates price discovery for different checks counts

### 3. Compositing Checks

Any participant can composite Checks held by the BlackCheck contract:

```solidity
blackCheck.composite(keepId, burnId);
```

Parameters:

- `keepId`: The token ID to keep (must be < burnId)
- `burnId`: The token ID to burn in the composite

Compositing rules:

- Enforces `keepId < burnId` to maintain consistency
- The Checks contract validates ownership and compatibility
- Increases the check count on the surviving NFT
- Permanently burns the composited NFT
- Emits a `Composite` event with the compositor's address

**Strategic Implications**:

- Compositing increases the value of the remaining Check
- Reduces the number of Checks available for redemption
- Progresses the ecosystem toward the ultimate Black Check
- Creates a public good (anyone can composite, everyone benefits)

### 4. Creating the Black Check (1/∞)

The ultimate goal: combine 64 single-check tokens into one Black Check:

```solidity
blackCheck.one([check1, check2, ..., check64]);
```

Requirements:

- Exactly 64 single-check tokens
- All owned by the BlackCheck contract
- Sorted array with smallest ID first
- Calls the Checks contract's `infinity()` function

Result:

- The first token in the array survives as the Black Check
- The other 63 are permanently burned
- Emits a `One` event with the creator's address
- Creates a culturally significant artifact (1/∞)

---

## Technical Architecture

### Smart Contract Design

BlackCheck inherits from:

- **Solady's ERC20**: Gas-optimized token implementation
- **IERC721Receiver**: Enables safe NFT transfers

### Contract Addresses

```
Checks Originals: 0x036721e5A769Cc48B3189EFbb9ccE4471E8A48B1
Checks Editions: 0x34eEBEE6942d8Def3c125458D1a86e0A897fd6f9
BlackCheck: 0x718477c471b335ee0ca29b9f4b95edd26d2ede54
Uniswap V4 Pool: 0x132c1c936dcb7837f24cc558745bbd4df0f393c6422eff8d1d406cd8004ded43
Checks Fee Handler: 0x989947278a87B7a3E00Ca258d7Ed416711E190f3
CheckStrategy (by TokenWorks): 0x2090dc81f42f6ddd8deace0d3c3339017417b0dc
```

### Initial Liquidity

The Uniswap V4 pool was funded with proceeds from the CheckStrategy ($CHKSTR) experiment by TokenWorks. This innovative strategy accumulated creator fees by purchasing Checks Originals, with over 700 Checks acquired through the strategy. The Checks Fee Handler contract has bought back over 70 of these Checks as part of the fee-based buyback mechanism.

### Security Features

1. **Max Supply Enforcement**: `_processMint` checks `totalSupply() + mintAmount <= MAX_SUPPLY`
2. **Only Checks NFTs**: `onERC721Received` validates `msg.sender == address(CHECKS)`
3. **No ETH Accepted**: `receive()` and `fallback()` revert with `NoEthAccepted()`
4. **Ownership Validation**: Exchange validates contract owns the Check before transfer
5. **Approval Checks**: Mint function validates proper approvals before transfers
6. **Ordering Enforcement**: Composite and one functions enforce ID ordering

### Events

```solidity
event Mint(address indexed to, uint256 indexed checkId, uint256 amount);
event Exchange(address indexed from, uint256 indexed checkId, uint256 amount);
event Composite(uint256 indexed keepId, uint256 indexed burnId, address compositor);
event One(uint256 indexed blackCheckId, address creator);
```

### Custom Errors

```solidity
error InvalidOrder();           // ID ordering violation
error MaxSupplyExceeded();      // Exceeds 1.0 token supply
error OnlyChecksContract();     // Invalid NFT source
error NoEthAccepted();          // ETH transfers rejected
error NotAllowed();             // Insufficient approval
```

### Gas Optimization

- Uses Solady's highly optimized ERC20 implementation
- Batch minting via array input
- Minimal storage reads in hot paths
- Direct constant access for MAX_SUPPLY and CHECKS address

---

## Game Theory & Economics

### Participant Incentives

**Depositors:**

- Convert illiquid NFTs to liquid tokens
- Gain exposure to the broader Checks ecosystem
- Accept risk of losing specific NFT to compositing

**Compositors:**

- Advance the artistic goal of creating 1/∞
- Potentially increase value of remaining Checks (scarcity)
- Cultural recognition via `Composite` event attribution
- No direct economic incentive (public good)

**Token Holders:**

- Speculate on $BLKCHK value relative to Checks
- Arbitrage price differences between rarities
- Participate in collective artwork creation

**Redeemers:**

- Acquire specific Checks if available
- Must burn proportional tokens
- Compete for desirable Check IDs

### Market Dynamics

**Supply Side:**

- Supply only increases via deposits (no inflation)
- Supply decreases via exchange (deflationary)
- Max supply is 1.0 token (hard cap)

**Demand Side:**

- Demand driven by desire for liquidity
- Cultural value of participating in "1/∞" creation
- Speculation on future Checks prices
- Utility of fungible representation

### Arbitrage Opportunities

Price discovery occurs across multiple dimensions:

1. **Checks Count**: Different checks counts may trade at different premiums
2. **Check IDs**: Lower token IDs may be more valuable (cultural preference)
3. **Visual Traits**: Color bands, gradients, and other attributes may command premiums
4. **Composite History**: Provenance may influence value

Example arbitrage:

```
If 1-check Checks trade at 20 ETH on OpenSea
And $BLKCHK trades at 1000 ETH per token
Then:
  1-check = 0.015625 $BLKCHK = 15.625 ETH
  Arbitrage: Buy 1-check at 20 ETH, deposit for $BLKCHK, lose -4.375 ETH
  (No arbitrage in this direction)

But if $BLKCHK trades at 1500 ETH:
  1-check = 0.015625 $BLKCHK = 23.4375 ETH
  Arbitrage: Buy 1-check at 20 ETH, deposit for $BLKCHK, profit +3.4375 ETH
```

### Compositing as Participatory Art

Compositing in the BlackCheck ecosystem represents an intrinsic form of artistic participation:

- **Creative Contribution**: Each composite action is a meaningful contribution to the collective artwork
- **Cultural Recognition**: Compositors are permanently recorded on-chain via `Composite` events
- **Shared Progress**: Advancing toward 1/∞ is a collaborative achievement involving the entire community
- **Artistic Motivation**: Participants are driven by the desire to be part of creating something culturally significant

This dynamic transforms what could be seen as a coordination challenge into an opportunity for intrinsic motivation and participatory artistic expression.

### Path to 1/∞

To create the Black Check requires:

1. Accumulating 64 single-check tokens in the contract
2. Multiple rounds of compositing from various starting states
3. Coordination or individual initiative to call `one()`

The path is uncertain and depends on:

- How many Checks are deposited
- How aggressively participants composite
- Whether someone prioritizes cultural achievement over economics

---

## Risks & Considerations

### Smart Contract Risks

- **Code Bugs**: Smart contracts may contain vulnerabilities
- **Compositing Loss**: Deposited Checks can be composited by anyone, losing the original
- **Irreversibility**: All blockchain transactions are permanent
- **Gas Costs**: Ethereum transactions require ETH for gas fees

### Market Risks

- **Illiquidity**: $BLKCHK may have limited trading volume
- **Price Volatility**: Token price may fluctuate significantly
- **Redemption Unavailability**: Desired Checks may not be held by the contract
- **Divergence from NAV**: Token price may not reflect underlying Check values

### Artistic Risks

- **Subjective Value**: Cultural value is inherently subjective
- **Attention Decay**: Community interest may wane over time
- **Completion Uncertainty**: The Black Check may never be created
- **Existential Questions**: What is the "value" of experimental art?

### Regulatory Considerations

**This is not financial advice. This is not a security.**

BlackCheck is positioned as experimental digital artwork. However:

- Regulatory treatment of NFTs and tokens is evolving
- Different jurisdictions may have different rules
- Participants are responsible for understanding their local laws
- No guarantees of legal status or tax treatment

### Disclaimer (Embedded in Contract)

The BlackCheck contract includes this notice:

> Participation involves engagement with experimental digital artworks on Ethereum.
> Mint, extract, and composite are creative acts — not financial transactions or investments.
> No offer to sell or buy any security or financial instrument is made or implied.
>
> By interacting, you accept all risks, including potential loss, error, or contract malfunction.
> No guarantees exist regarding liquidity, value, availability, or performance.
> Checks may be modified or irreversibly transformed by others at any time.
> Extraction of some forms, including the Black Check, may be impossible.
>
> All results are part of the artwork.
> Value and meaning are subjective.
> Participation is voluntary and at your own risk.
> You are responsible for following all applicable laws.
>
> This artwork may or may not be notable.

---

## Conclusion

Black Check represents a novel experiment at the intersection of NFTs, fungible tokens, and on-chain art. By creating a liquid representation of Checks Originals while maintaining paths to redemption and compositing, the protocol explores fundamental questions about:

- **Fungibility vs. Uniqueness**: Can unique art be meaningfully fungible?
- **Individual vs. Collective**: How do personal interests align with group goals?
- **Value Creation**: Where does value come from in digital art?
- **Ownership Models**: What does it mean to "own" a fractional claim on art?

The ultimate success of BlackCheck cannot be measured purely in economic terms. As an artwork, it succeeds by provoking thought, enabling participation, and creating new forms of cultural expression.

Whether the community successfully creates 1/∞ — the singular Black Check — remains to be seen. The journey itself is part of the artwork.

---

## Technical Specifications

### Contract Information

- **Solidity Version**: ^0.8.28
- **License**: MIT
- **ERC20 Implementation**: Solady
- **Decimals**: 18
- **Max Supply**: 1 × 10^18 wei

### Key Functions

```solidity
// Deposit via direct transfer
function onERC721Received(
    address operator,
    address from,
    uint256 tokenId,
    bytes calldata data
) external override returns (bytes4)

// Deposit via approval
function mint(uint256[] calldata checkIds) external

// Redeem specific Check
function exchange(uint256 checkId) external

// Composite two Checks
function composite(uint256 keepId, uint256 burnId) external

// Create Black Check
function one(uint256[] calldata tokenIds) external

// View token allocation
function _calculateAmount(uint8 divisorIndex) private pure returns (uint256)
```

### Dependencies

- **Solady**: Modern, gas-optimized Solidity libraries
- **Checks Originals**: 0x036721e5A769Cc48B3189EFbb9ccE4471E8A48B1

---

## Resources

- **Checks Project**: [https://checks.art/](https://checks.art/)
- **VisualizeValue**: [https://visualizevalue.com](https://visualizevalue.com)
- **BlackCheck GitHub**: [https://github.com/visualizevalue/black-check](https://github.com/visualizevalue/black-check)
- **Checks Originals Contract**: [0x036721e5A769Cc48B3189EFbb9ccE4471E8A48B1](https://etherscan.io/address/0x036721e5A769Cc48B3189EFbb9ccE4471E8A48B1)
- **Checks Editions Contract**: [0x34eEBEE6942d8Def3c125458D1a86e0A897fd6f9](https://etherscan.io/address/0x34eEBEE6942d8Def3c125458D1a86e0A897fd6f9)
- **BlackCheck Contract**: [0x718477c471b335ee0ca29b9f4b95edd26d2ede54](https://etherscan.io/address/0x718477c471b335ee0ca29b9f4b95edd26d2ede54)
- **CheckStrategy**: [https://www.nftstrategy.fun/strategies/0x2090dc81f42f6ddd8deace0d3c3339017417b0dc](https://www.nftstrategy.fun/strategies/0x2090dc81f42f6ddd8deace0d3c3339017417b0dc)

---

_Version 1.0 — October 2025_

_This whitepaper describes an experimental artwork. Nothing herein constitutes financial, legal, or investment advice. Participation is entirely at your own risk. Value and meaning are subjective. This artwork may or may not be notable._
