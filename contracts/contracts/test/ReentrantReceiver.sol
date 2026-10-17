// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface ICarbonRegistry {
    function registerProject(
        string calldata name,
        address owner,
        bytes32[] calldata regionCells,
        bytes32 evidenceHash,
        string calldata evidenceURI,
        uint8 score,
        uint256 credits
    ) external returns (uint256);
}

/// @dev Test-only receiver that tries to re-enter registration during an ERC-1155 callback.
contract ReentrantReceiver is IERC1155Receiver {
    ICarbonRegistry private immutable registry;
    bytes32 private immutable reentryCell;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(ICarbonRegistry registry_, bytes32 reentryCell_) {
        registry = registry_;
        reentryCell = reentryCell_;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        override
        returns (bytes4)
    {
        reentryAttempted = true;
        bytes32[] memory cells = new bytes32[](1);
        cells[0] = reentryCell;
        try registry.registerProject("reentry", address(this), cells, keccak256("evidence"), "ipfs://reentry", 90, 1) {
            reentrySucceeded = true;
        } catch {
            reentrySucceeded = false;
        }
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
