// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CarbonLens testnet project registry
/// @notice Registers verified land-cell commitments and mints a per-project ERC-1155 credit token.
/// @dev Credits are transferable ERC-1155 tokens by design for this demo; transfers are not a claim of credit-market validity.
contract CarbonRegistry is ERC1155, AccessControlDefaultAdminRules, Pausable, ReentrancyGuard {
    /// @notice Role allowed to submit verified projects.
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    /// @notice Role allowed to pause and unpause registration.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Maximum number of deterministic region cells accepted for one project.
    uint256 public constant MAX_CELLS = 512;
    /// @notice Maximum UTF-8 byte length of a project name.
    uint256 public constant MAX_NAME_LENGTH = 64;
    /// @notice Maximum UTF-8 byte length of an evidence URI.
    uint256 public constant MAX_URI_LENGTH = 128;
    /// @notice Maximum credit amount minted for one project.
    uint256 public constant MAX_CREDITS = 1_000_000;
    uint8 private constant MIN_SCORE_THRESHOLD = 50;
    uint8 private constant MAX_SCORE_THRESHOLD = 95;

    /// @notice Immutable metadata stored for a registered project.
    struct Project {
        string name;
        address owner;
        uint8 score;
        bytes32 evidenceHash;
        string evidenceURI;
        uint256 credits;
        uint64 createdAt;
    }

    /// @notice Maps a region cell hash to project ID plus one; zero means the cell is unregistered.
    mapping(bytes32 cell => uint256 projectIdPlusOne) public cellProject;

    /// @notice Minimum score required for project registration.
    uint8 public scoreThreshold;

    Project[] private projects;

    error DuplicateRegion(bytes32 cell);
    error DuplicateCell(bytes32 cell);
    error EmptyName();
    error EmptyEvidenceURI();
    error InvalidCellCount(uint256 count);
    error InvalidCredits(uint256 credits);
    error InvalidEvidenceHash();
    error InvalidScore(uint8 score);
    error InvalidThreshold(uint8 threshold);
    error NameTooLong(uint256 length);
    error ProjectNotFound(uint256 projectId);
    error ScoreTooLow(uint8 score, uint8 threshold);
    error URITooLong(uint256 length);
    error ZeroAddress();

    /// @notice Emitted after a verifier registers a project and credits are minted.
    event ProjectRegistered(
        uint256 indexed projectId,
        address indexed owner,
        uint8 score,
        bytes32 indexed evidenceHash,
        uint256 credits
    );
    /// @notice Emitted when the score threshold changes.
    event ScoreThresholdUpdated(uint8 previousThreshold, uint8 newThreshold);

    /// @notice Creates the registry and grants operational roles to the initial admin.
    /// @param initialAdmin Account that begins as default admin, verifier, and pauser.
    /// @param initialScoreThreshold Initial threshold, bounded from 50 through 95.
    /// @param baseTokenURI ERC-1155 metadata URI template; use a public non-sensitive URI or an empty string.
    constructor(address initialAdmin, uint8 initialScoreThreshold, string memory baseTokenURI)
        ERC1155(baseTokenURI)
        AccessControlDefaultAdminRules(1 days, initialAdmin)
    {
        _validateThreshold(initialScoreThreshold);
        scoreThreshold = initialScoreThreshold;
        _grantRole(VERIFIER_ROLE, initialAdmin);
        _grantRole(PAUSER_ROLE, initialAdmin);
    }

    /// @notice Registers a verified project and mints its project-specific credits to the owner.
    /// @dev All state changes occur before `_mint`; `nonReentrant` protects the ERC-1155 receiver callback.
    /// @param name Validated public project name.
    /// @param owner Recipient of the newly minted project credit token.
    /// @param regionCells Deterministic cell hashes that must all be unregistered.
    /// @param evidenceHash Keccak-256 or equivalent fixed evidence commitment.
    /// @param evidenceURI Public, non-sensitive evidence location.
    /// @param score Verifier score from 0 through 100, meeting the configured threshold.
    /// @param credits Amount of the project-specific ERC-1155 token to mint.
    /// @return projectId Sequential project identifier and ERC-1155 token ID.
    function registerProject(
        string calldata name,
        address owner,
        bytes32[] calldata regionCells,
        bytes32 evidenceHash,
        string calldata evidenceURI,
        uint8 score,
        uint256 credits
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused nonReentrant returns (uint256 projectId) {
        if (owner == address(0)) revert ZeroAddress();
        _validateProjectFields(name, regionCells.length, evidenceHash, evidenceURI, score, credits);
        _validateCellsAreFreeAndUnique(regionCells);

        projectId = projects.length;
        for (uint256 index; index < regionCells.length; ++index) {
            cellProject[regionCells[index]] = projectId + 1;
        }

        projects.push(Project({
            name: name,
            owner: owner,
            score: score,
            evidenceHash: evidenceHash,
            evidenceURI: evidenceURI,
            credits: credits,
            createdAt: uint64(block.timestamp)
        }));

        _mint(owner, projectId, credits, "");
        emit ProjectRegistered(projectId, owner, score, evidenceHash, credits);
    }

    /// @notice Checks whether all supplied region cells are currently unregistered.
    /// @param cells Deterministic region cell hashes to inspect.
    /// @return free True when no cell conflicts with a registered project.
    /// @return firstConflict The first occupied cell, or zero when all cells are free.
    function checkRegion(bytes32[] calldata cells) external view returns (bool free, bytes32 firstConflict) {
        if (cells.length == 0 || cells.length > MAX_CELLS) revert InvalidCellCount(cells.length);
        for (uint256 index; index < cells.length; ++index) {
            if (cellProject[cells[index]] != 0) return (false, cells[index]);
        }
        return (true, bytes32(0));
    }

    /// @notice Returns the immutable record for a project identifier.
    /// @param projectId Sequential project identifier.
    /// @return project Stored project data.
    function getProject(uint256 projectId) external view returns (Project memory project) {
        // slither-disable-next-line timestamp
        if (projectId >= projects.length) revert ProjectNotFound(projectId);
        return projects[projectId];
    }

    /// @notice Returns the total number of registered projects.
    /// @return count Number of projects in the registry.
    function projectCount() external view returns (uint256 count) {
        return projects.length;
    }

    /// @notice Updates the verifier score threshold.
    /// @param newThreshold Score threshold from 50 through 95 inclusive.
    function setScoreThreshold(uint8 newThreshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _validateThreshold(newThreshold);
        uint8 previousThreshold = scoreThreshold;
        scoreThreshold = newThreshold;
        emit ScoreThresholdUpdated(previousThreshold, newThreshold);
    }

    /// @notice Pauses new project registrations.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resumes project registrations.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Returns whether this registry supports an ERC-165 interface.
    /// @param interfaceId ERC-165 interface identifier.
    /// @return supported True when the interface is supported.
    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControlDefaultAdminRules) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _validateProjectFields(
        string calldata name,
        uint256 cellCount,
        bytes32 evidenceHash,
        string calldata evidenceURI,
        uint8 score,
        uint256 credits
    ) private view {
        uint256 nameLength = bytes(name).length;
        if (nameLength == 0) revert EmptyName();
        if (nameLength > MAX_NAME_LENGTH) revert NameTooLong(nameLength);
        if (cellCount == 0 || cellCount > MAX_CELLS) revert InvalidCellCount(cellCount);
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();
        uint256 uriLength = bytes(evidenceURI).length;
        if (uriLength == 0) revert EmptyEvidenceURI();
        if (uriLength > MAX_URI_LENGTH) revert URITooLong(uriLength);
        if (score > 100) revert InvalidScore(score);
        if (score < scoreThreshold) revert ScoreTooLow(score, scoreThreshold);
        if (credits == 0 || credits > MAX_CREDITS) revert InvalidCredits(credits);
    }

    function _validateCellsAreFreeAndUnique(bytes32[] calldata regionCells) private view {
        for (uint256 index; index < regionCells.length; ++index) {
            bytes32 cell = regionCells[index];
            if (cellProject[cell] != 0) revert DuplicateRegion(cell);
            for (uint256 previous; previous < index; ++previous) {
                if (cell == regionCells[previous]) revert DuplicateCell(cell);
            }
        }
    }

    function _validateThreshold(uint8 threshold) private pure {
        if (threshold < MIN_SCORE_THRESHOLD || threshold > MAX_SCORE_THRESHOLD) {
            revert InvalidThreshold(threshold);
        }
    }
}
