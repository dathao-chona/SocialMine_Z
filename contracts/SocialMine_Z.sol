pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SocialMine is ZamaEthereumConfig {
    struct SocialData {
        address owner;
        euint32 encryptedScore;
        uint32 publicScore;
        uint256 timestamp;
        bool isVerified;
    }

    mapping(address => SocialData) public userSocialData;
    mapping(address => bool) public hasClaimed;

    event SocialDataRegistered(address indexed user, uint256 timestamp);
    event ContributionCalculated(address indexed user, uint32 score);
    event RewardClaimed(address indexed user, uint256 amount);

    constructor() ZamaEthereumConfig() {}

    function registerSocialData(
        externalEuint32 encryptedScore,
        bytes calldata inputProof
    ) external {
        require(!isRegistered(msg.sender), "User already registered");
        
        euint32 encrypted = FHE.fromExternal(encryptedScore, inputProof);
        require(FHE.isInitialized(encrypted), "Invalid encrypted input");

        userSocialData[msg.sender] = SocialData({
            owner: msg.sender,
            encryptedScore: encrypted,
            publicScore: 0,
            timestamp: block.timestamp,
            isVerified: false
        });

        FHE.allowThis(encrypted);
        FHE.makePubliclyDecryptable(encrypted);

        emit SocialDataRegistered(msg.sender, block.timestamp);
    }

    function calculateContribution(
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(isRegistered(msg.sender), "User not registered");
        require(!userSocialData[msg.sender].isVerified, "Contribution already calculated");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(userSocialData[msg.sender].encryptedScore);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        userSocialData[msg.sender].publicScore = decodedValue;
        userSocialData[msg.sender].isVerified = true;

        emit ContributionCalculated(msg.sender, decodedValue);
    }

    function claimReward() external {
        require(isRegistered(msg.sender), "User not registered");
        require(userSocialData[msg.sender].isVerified, "Contribution not verified");
        require(!hasClaimed[msg.sender], "Reward already claimed");

        uint256 rewardAmount = calculateReward(userSocialData[msg.sender].publicScore);
        hasClaimed[msg.sender] = true;

        // In real implementation, use ERC20 token transfer
        // IERC20(tokenAddress).transfer(msg.sender, rewardAmount);

        emit RewardClaimed(msg.sender, rewardAmount);
    }

    function isRegistered(address user) public view returns (bool) {
        return userSocialData[user].owner != address(0);
    }

    function getUserData(address user) external view returns (
        euint32 encryptedScore,
        uint32 publicScore,
        uint256 timestamp,
        bool isVerified,
        bool claimed
    ) {
        SocialData storage data = userSocialData[user];
        return (
            data.encryptedScore,
            data.publicScore,
            data.timestamp,
            data.isVerified,
            hasClaimed[user]
        );
    }

    function calculateReward(uint32 score) internal pure returns (uint256) {
        // Simplified reward calculation
        return uint256(score) * 1000000000000000; // 0.001 tokens per score point
    }

    function getEncryptedScore(address user) external view returns (euint32) {
        require(isRegistered(user), "User not registered");
        return userSocialData[user].encryptedScore;
    }

    function getPublicScore(address user) external view returns (uint32) {
        require(isRegistered(user), "User not registered");
        return userSocialData[user].publicScore;
    }

    function getRegistrationTime(address user) external view returns (uint256) {
        require(isRegistered(user), "User not registered");
        return userSocialData[user].timestamp;
    }

    function isVerified(address user) external view returns (bool) {
        require(isRegistered(user), "User not registered");
        return userSocialData[user].isVerified;
    }

    function hasUserClaimed(address user) external view returns (bool) {
        return hasClaimed[user];
    }

    function serviceStatus() external pure returns (bool operational) {
        return true;
    }
}


