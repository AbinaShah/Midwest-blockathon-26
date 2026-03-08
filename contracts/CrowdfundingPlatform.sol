// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProofFund Crowdfunding Platform
 *
 * Milestone-based crowdfunding with donor-weighted voting, escrowed funds,
 * optional refunds, and donor recognition NFTs.
 */
contract CrowdfundingPlatform is ERC721URIStorage, Ownable {
    struct Milestone {
        uint256 milestoneId;
        string description;
        uint256 requiredAmount;
        string proofHash; // IPFS hash
        uint256 votesFor;
        uint256 votesAgainst;
        bool isApproved;
        bool fundsReleased;
        // donor => hasVoted
        mapping(address => bool) hasVoted;
    }

    struct Campaign {
        uint256 campaignId;
        address creator;
        string title;
        string description;
        string location;
        uint256 fundingGoal;
        uint256 totalRaised;
        uint256 deadline;
        bool isCompleted;
        bool refunded;
        uint256 fraudScore;   // 0-100, set by verifier after AI check
        bool isVerified;      // true when fraud check passed
        Milestone[] milestones;
        mapping(address => uint256) donors;
        address[] donorList;
        uint256 totalReleased;
        uint256 flags;
        mapping(address => bool) hasFlagged;
    }

    struct CampaignView {
        uint256 campaignId;
        address creator;
        string title;
        string description;
        string location;
        uint256 fundingGoal;
        uint256 totalRaised;
        uint256 deadline;
        bool isCompleted;
        uint256 totalReleased;
        uint256 milestoneCount;
        uint256 flags;
        uint256 fraudScore;
        bool isVerified;
        string metadataHash; // Pinata IPFS CID for content-addressed campaign metadata
    }

    // Lightweight view struct for milestones (no mappings)
    struct MilestoneView {
        uint256 milestoneId;
        string description;
        uint256 requiredAmount;
        string proofHash;
        uint256 votesFor;
        uint256 votesAgainst;
        bool isApproved;
        bool fundsReleased;
    }

    uint256 public nextCampaignId;

    // ProofFund: verifier address (backend/oracle) can set fraud score & verification
    address public verifier;

    // Global analytics
    uint256 public totalCampaigns;
    uint256 public totalFundsRaised;
    uint256 public totalFundsReleased;

    mapping(uint256 => Campaign) private campaigns;
    mapping(uint256 => string) public campaignMetadataHash; // campaignId => Pinata IPFS CID
    uint256[] public successfulCampaignIds;

    // Creator reputation: number of successful campaigns
    mapping(address => uint256) public creatorReputation;

    // Global donor analytics
    mapping(address => uint256) public totalDonatedByAddress;
    address[] public globalDonors;
    mapping(address => bool) private isGlobalDonor;

    // NFT tracking
    uint256 private _nextTokenId;

    enum Tier {
        Bronze,
        Silver,
        Gold
    }

    // Hard-coded IPFS URIs for NFT tiers (update with real IPFS hashes)
    string public bronzeURI;
    string public silverURI;
    string public goldURI;

    // ======== Events ========

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        uint256 fundingGoal,
        uint256 deadline
    );

    event DonationReceived(
        uint256 indexed campaignId,
        address indexed donor,
        uint256 amount
    );

    event MilestoneProofSubmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        string ipfsHash
    );

    event MilestoneVoted(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        address indexed voter,
        bool approve,
        uint256 weight
    );

    event FundsReleased(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        uint256 amount
    );

    event RefundClaimed(
        uint256 indexed campaignId,
        address indexed donor,
        uint256 amount
    );

    event CampaignFlagged(
        uint256 indexed campaignId,
        address indexed flagger,
        uint256 totalFlags
    );

    event TierNFTMinted(
        address indexed donor,
        uint256 tokenId,
        Tier tier
    );

    constructor(
        string memory _bronzeURI,
        string memory _silverURI,
        string memory _goldURI
    ) ERC721("ProofFund Donor", "PFDONOR") Ownable(msg.sender) {
        bronzeURI = _bronzeURI;
        silverURI = _silverURI;
        goldURI = _goldURI;
        verifier = msg.sender;
    }

    function setVerifier(address _verifier) external onlyOwner {
        verifier = _verifier;
    }

    // ======== Modifiers & Internals ========

    modifier campaignExists(uint256 campaignId) {
        require(campaignId < nextCampaignId, "Campaign does not exist");
        _;
    }

    function _getCampaign(
        uint256 campaignId
    ) internal view campaignExists(campaignId) returns (Campaign storage) {
        return campaigns[campaignId];
    }

    function _mintTierNFT(address to, uint256 amount) internal {
        // Simple tiering logic; thresholds can be tuned
        Tier tier;
        string memory uri;

        if (amount >= 1 ether) {
            tier = Tier.Gold;
            uri = goldURI;
        } else if (amount >= 0.25 ether) {
            tier = Tier.Silver;
            uri = silverURI;
        } else {
            tier = Tier.Bronze;
            uri = bronzeURI;
        }

        uint256 tokenId = ++_nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit TierNFTMinted(to, tokenId, tier);
    }

    // ======== Core Functions ========

    function createCampaign(
        string calldata title,
        string calldata description,
        string calldata location,
        uint256 fundingGoal,
        uint256 deadline,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts
    ) external {
        require(fundingGoal > 0, "Funding goal must be > 0");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(
            milestoneDescriptions.length == milestoneAmounts.length &&
                milestoneDescriptions.length > 0,
            "Invalid milestones"
        );

        uint256 totalMilestoneAmount;
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            totalMilestoneAmount += milestoneAmounts[i];
        }
        require(
            totalMilestoneAmount == fundingGoal,
            "Milestones must sum to funding goal"
        );

        uint256 campaignId = nextCampaignId++;
        Campaign storage c = campaigns[campaignId];
        c.campaignId = campaignId;
        c.creator = msg.sender;
        c.title = title;
        c.description = description;
        c.location = location;
        c.fundingGoal = fundingGoal;
        c.deadline = deadline;
        c.isCompleted = false;
        c.refunded = false;
        c.fraudScore = 0;
        c.isVerified = false;

        for (uint256 i = 0; i < milestoneDescriptions.length; i++) {
            Milestone storage m = c.milestones.push();
            m.milestoneId = i;
            m.description = milestoneDescriptions[i];
            m.requiredAmount = milestoneAmounts[i];
        }

        totalCampaigns += 1;

        emit CampaignCreated(campaignId, msg.sender, fundingGoal, deadline);
    }

    /// @dev Called by verifier (AI backend) after fraud check. fraudScore 0-100.
    function setCampaignVerification(
        uint256 campaignId,
        uint256 _fraudScore,
        bool _isVerified
    ) external campaignExists(campaignId) {
        require(msg.sender == verifier, "Only verifier");
        require(_fraudScore <= 100, "Invalid score");
        Campaign storage c = campaigns[campaignId];
        c.fraudScore = _fraudScore;
        c.isVerified = _isVerified;
    }

    function donate(
        uint256 campaignId
    ) external payable campaignExists(campaignId) {
        require(msg.value > 0, "Must send some ETH");
        Campaign storage c = campaigns[campaignId];
        require(block.timestamp < c.deadline, "Campaign has ended");
        require(!c.refunded, "Campaign is refunded");

        if (c.donors[msg.sender] == 0) {
            c.donorList.push(msg.sender);
        }
        c.donors[msg.sender] += msg.value;
        c.totalRaised += msg.value;

        totalFundsRaised += msg.value;

        if (!isGlobalDonor[msg.sender]) {
            isGlobalDonor[msg.sender] = true;
            globalDonors.push(msg.sender);
        }
        totalDonatedByAddress[msg.sender] += msg.value;

        // Mint recognition NFT for this donation
        _mintTierNFT(msg.sender, msg.value);

        emit DonationReceived(campaignId, msg.sender, msg.value);
    }

    function submitMilestoneProof(
        uint256 campaignId,
        uint256 milestoneId,
        string calldata ipfsHash
    ) external campaignExists(campaignId) {
        Campaign storage c = campaigns[campaignId];
        require(msg.sender == c.creator, "Only creator can submit proof");
        require(!c.refunded, "Campaign refunded");
        require(
            milestoneId < c.milestones.length,
            "Invalid milestoneId"
        );

        Milestone storage m = c.milestones[milestoneId];
        m.proofHash = ipfsHash;

        emit MilestoneProofSubmitted(campaignId, milestoneId, ipfsHash);
    }

    function voteMilestone(
        uint256 campaignId,
        uint256 milestoneId,
        bool approve
    ) external campaignExists(campaignId) {
        Campaign storage c = campaigns[campaignId];
        require(
            milestoneId < c.milestones.length,
            "Invalid milestoneId"
        );
        require(c.donors[msg.sender] > 0, "Only donors can vote");
        require(!c.refunded, "Campaign refunded");

        Milestone storage m = c.milestones[milestoneId];
        require(!m.fundsReleased, "Funds already released");
        require(!m.hasVoted[msg.sender], "Already voted");

        uint256 weight = c.donors[msg.sender];
        m.hasVoted[msg.sender] = true;

        if (approve) {
            m.votesFor += weight;
        } else {
            m.votesAgainst += weight;
        }

        emit MilestoneVoted(campaignId, milestoneId, msg.sender, approve, weight);
    }

    function releaseFunds(
        uint256 campaignId,
        uint256 milestoneId
    ) external campaignExists(campaignId) {
        Campaign storage c = campaigns[campaignId];
        require(msg.sender == c.creator, "Only creator can release");
        require(!c.refunded, "Campaign refunded");
        require(
            milestoneId < c.milestones.length,
            "Invalid milestoneId"
        );

        Milestone storage m = c.milestones[milestoneId];
        require(!m.fundsReleased, "Already released");
        require(bytes(m.proofHash).length != 0, "Proof not submitted");

        // Simple majority of weighted votes
        require(
            m.votesFor > m.votesAgainst,
            "Milestone not approved by donors"
        );

        require(
            c.totalRaised >= c.totalReleased + m.requiredAmount,
            "Insufficient raised funds"
        );

        m.fundsReleased = true;
        c.totalReleased += m.requiredAmount;
        totalFundsReleased += m.requiredAmount;

        (bool sent, ) = c.creator.call{value: m.requiredAmount}("");
        require(sent, "Transfer failed");

        emit FundsReleased(campaignId, milestoneId, m.requiredAmount);

        // Mark campaign successful when all milestones are released
        bool allReleased = true;
        for (uint256 i = 0; i < c.milestones.length; i++) {
            if (!c.milestones[i].fundsReleased) {
                allReleased = false;
                break;
            }
        }
        if (allReleased && !c.isCompleted) {
            c.isCompleted = true;
            creatorReputation[c.creator] += 1;
            successfulCampaignIds.push(campaignId);
        }
    }

    /**
     * @dev Allows individual donors to claim refunds after deadline
     *      if funding goal was not met. The function name matches
     *      the spec but refunds only msg.sender.
     */
    function refundDonors(
        uint256 campaignId
    ) external campaignExists(campaignId) {
        Campaign storage c = campaigns[campaignId];
        require(block.timestamp > c.deadline, "Deadline not passed");
        require(c.totalRaised < c.fundingGoal, "Goal was reached");
        require(!c.refunded, "Campaign already refunded");

        uint256 contributed = c.donors[msg.sender];
        require(contributed > 0, "No contribution to refund");

        c.donors[msg.sender] = 0;

        (bool sent, ) = msg.sender.call{value: contributed}("");
        require(sent, "Refund transfer failed");

        emit RefundClaimed(campaignId, msg.sender, contributed);
    }

    // ======== Reputation & Flags ========

    /// @dev Set content-addressed campaign metadata (Pinata IPFS CID). Creator or verifier only.
    function setCampaignMetadataHash(
        uint256 campaignId,
        string calldata ipfsCid
    ) external campaignExists(campaignId) {
        Campaign storage c = campaigns[campaignId];
        require(
            msg.sender == c.creator || msg.sender == verifier,
            "Only creator or verifier"
        );
        campaignMetadataHash[campaignId] = ipfsCid;
    }

    function flagCampaign(
        uint256 campaignId
    ) external campaignExists(campaignId) {
        Campaign storage c = campaigns[campaignId];
        require(c.donors[msg.sender] > 0, "Only donors can flag");
        require(!c.hasFlagged[msg.sender], "Already flagged");

        c.hasFlagged[msg.sender] = true;
        c.flags += 1;

        emit CampaignFlagged(campaignId, msg.sender, c.flags);
    }

    // ======== View Functions ========

    function getCampaign(
        uint256 campaignId
    ) external view campaignExists(campaignId) returns (CampaignView memory) {
        Campaign storage c = campaigns[campaignId];
        return
            CampaignView({
                campaignId: c.campaignId,
                creator: c.creator,
                title: c.title,
                description: c.description,
                location: c.location,
                fundingGoal: c.fundingGoal,
                totalRaised: c.totalRaised,
                deadline: c.deadline,
                isCompleted: c.isCompleted,
                totalReleased: c.totalReleased,
                milestoneCount: c.milestones.length,
                flags: c.flags,
                fraudScore: c.fraudScore,
                isVerified: c.isVerified,
                metadataHash: campaignMetadataHash[campaignId]
            });
    }

    function getAllCampaigns()
        external
        view
        returns (CampaignView[] memory)
    {
        CampaignView[] memory list = new CampaignView[](nextCampaignId);
        for (uint256 i = 0; i < nextCampaignId; i++) {
            Campaign storage c = campaigns[i];
            list[i] = CampaignView({
                campaignId: c.campaignId,
                creator: c.creator,
                title: c.title,
                description: c.description,
                location: c.location,
                fundingGoal: c.fundingGoal,
                totalRaised: c.totalRaised,
                deadline: c.deadline,
                isCompleted: c.isCompleted,
                totalReleased: c.totalReleased,
                milestoneCount: c.milestones.length,
                flags: c.flags,
                fraudScore: c.fraudScore,
                isVerified: c.isVerified,
                metadataHash: campaignMetadataHash[i]
            });
        }
        return list;
    }

    function getMilestones(
        uint256 campaignId
    )
        external
        view
        campaignExists(campaignId)
        returns (MilestoneView[] memory milestonesView)
    {
        Campaign storage c = campaigns[campaignId];
        uint256 len = c.milestones.length;
        milestonesView = new MilestoneView[](len);
        for (uint256 i = 0; i < len; i++) {
            Milestone storage m = c.milestones[i];
            milestonesView[i] = MilestoneView({
                milestoneId: m.milestoneId,
                description: m.description,
                requiredAmount: m.requiredAmount,
                proofHash: m.proofHash,
                votesFor: m.votesFor,
                votesAgainst: m.votesAgainst,
                isApproved: m.isApproved,
                fundsReleased: m.fundsReleased
            });
        }
    }

    function getDonors(
        uint256 campaignId
    )
        external
        view
        campaignExists(campaignId)
        returns (address[] memory donors, uint256[] memory amounts)
    {
        Campaign storage c = campaigns[campaignId];
        donors = c.donorList;
        amounts = new uint256[](donors.length);
        for (uint256 i = 0; i < donors.length; i++) {
            amounts[i] = c.donors[donors[i]];
        }
    }

    function getGlobalDonors()
        external
        view
        returns (address[] memory donors, uint256[] memory amounts)
    {
        donors = globalDonors;
        amounts = new uint256[](donors.length);
        for (uint256 i = 0; i < donors.length; i++) {
            amounts[i] = totalDonatedByAddress[donors[i]];
        }
    }

    function getSuccessfulCampaignIds()
        external
        view
        returns (uint256[] memory)
    {
        return successfulCampaignIds;
    }

    // ======== Admin (optional) ========

    function updateTierURIs(
        string calldata _bronzeURI,
        string calldata _silverURI,
        string calldata _goldURI
    ) external onlyOwner {
        bronzeURI = _bronzeURI;
        silverURI = _silverURI;
        goldURI = _goldURI;
    }
}

