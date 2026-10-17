const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const SCORE_THRESHOLD = 70;
const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("carbonlens-evidence"));

function cell(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return function () {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

async function deployRegistry() {
  const [admin, verifier, owner, other, nextAdmin] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("CarbonRegistry");
  const registry = await Registry.deploy(admin.address, SCORE_THRESHOLD, "");
  await registry.waitForDeployment();
  const verifierRole = await registry.VERIFIER_ROLE();
  const pauserRole = await registry.PAUSER_ROLE();
  await registry.grantRole(verifierRole, verifier.address);
  await registry.grantRole(pauserRole, verifier.address);
  return { registry, admin, verifier, owner, other, nextAdmin, verifierRole, pauserRole };
}

async function register(registry, signer, owner, cells = [cell("a"), cell("b")], overrides = {}) {
  return registry.connect(signer).registerProject(
    overrides.name ?? "Mangrove restoration",
    owner.address ?? owner,
    cells,
    overrides.evidenceHash ?? evidenceHash,
    overrides.evidenceURI ?? "ipfs://bafycarbonlens-evidence",
    overrides.score ?? 82,
    overrides.credits ?? 100
  );
}

describe("CarbonRegistry", function () {
  it("registers a verified project, commits cells, and mints its ERC-1155 credits", async function () {
    const { registry, verifier, owner } = await deployRegistry();
    const cells = [cell("a"), cell("b")];

    await expect(register(registry, verifier, owner, cells))
      .to.emit(registry, "ProjectRegistered")
      .withArgs(0, owner.address, 82, evidenceHash, 100);

    const project = await registry.getProject(0);
    expect(project.name).to.equal("Mangrove restoration");
    expect(project.owner).to.equal(owner.address);
    expect(project.score).to.equal(82);
    expect(project.evidenceHash).to.equal(evidenceHash);
    expect(project.credits).to.equal(100);
    expect(project.createdAt).to.be.greaterThan(0);
    expect(await registry.cellProject(cells[0])).to.equal(1);
    expect(await registry.balanceOf(owner.address, 0)).to.equal(100);
    expect(await registry.projectCount()).to.equal(1);
    expect(await registry.checkRegion(cells)).to.deep.equal([false, cells[0]]);
  });

  it("reports free cells and supports ERC-165 interface detection", async function () {
    const { registry } = await deployRegistry();
    const freeCells = [cell("free-a"), cell("free-b")];
    expect(await registry.checkRegion(freeCells)).to.deep.equal([true, ethers.ZeroHash]);
    expect(await registry.supportsInterface("0x01ffc9a7")).to.equal(true);
  });

  it("rejects duplicate and partially overlapping regions", async function () {
    const { registry, verifier, owner } = await deployRegistry();
    const first = [cell("a"), cell("b")];
    await register(registry, verifier, owner, first);

    await expect(register(registry, verifier, owner, [cell("c"), cell("b")]))
      .to.be.revertedWithCustomError(registry, "DuplicateRegion")
      .withArgs(cell("b"));
    await expect(register(registry, verifier, owner, first))
      .to.be.revertedWithCustomError(registry, "DuplicateRegion")
      .withArgs(cell("a"));
  });

  it("rejects duplicate cells supplied within one registration", async function () {
    const { registry, verifier, owner } = await deployRegistry();
    const duplicate = cell("same");
    await expect(register(registry, verifier, owner, [duplicate, duplicate]))
      .to.be.revertedWithCustomError(registry, "DuplicateCell")
      .withArgs(duplicate);
  });

  it("rejects low and invalid scores", async function () {
    const { registry, verifier, owner } = await deployRegistry();
    await expect(register(registry, verifier, owner, [cell("low")], { score: 69 }))
      .to.be.revertedWithCustomError(registry, "ScoreTooLow")
      .withArgs(69, SCORE_THRESHOLD);
    await expect(register(registry, verifier, owner, [cell("high")], { score: 101 }))
      .to.be.revertedWithCustomError(registry, "InvalidScore")
      .withArgs(101);
  });

  it("rejects unauthorized registration and pausing", async function () {
    const { registry, owner, other } = await deployRegistry();
    await expect(register(registry, other, owner, [cell("unauthorized")]))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.connect(other).pause())
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("stops registration while paused and resumes when unpaused", async function () {
    const { registry, verifier, owner } = await deployRegistry();
    await registry.connect(verifier).pause();
    await expect(register(registry, verifier, owner, [cell("paused")])).to.be.revertedWithCustomError(registry, "EnforcedPause");
    await registry.connect(verifier).unpause();
    await expect(register(registry, verifier, owner, [cell("unpaused")])).to.not.be.reverted;
  });

  it("enforces all registration size and value bounds", async function () {
    const { registry, verifier, owner } = await deployRegistry();
    const tooManyCells = Array.from({ length: 513 }, (_, index) => cell(`large-${index}`));
    await expect(register(registry, verifier, owner, []))
      .to.be.revertedWithCustomError(registry, "InvalidCellCount");
    await expect(register(registry, verifier, owner, tooManyCells))
      .to.be.revertedWithCustomError(registry, "InvalidCellCount");
    await expect(register(registry, verifier, owner, [cell("empty-name")], { name: "" }))
      .to.be.revertedWithCustomError(registry, "EmptyName");
    await expect(register(registry, verifier, owner, [cell("name")], { name: "x".repeat(65) }))
      .to.be.revertedWithCustomError(registry, "NameTooLong");
    await expect(register(registry, verifier, owner, [cell("empty-uri")], { evidenceURI: "" }))
      .to.be.revertedWithCustomError(registry, "EmptyEvidenceURI");
    await expect(register(registry, verifier, owner, [cell("uri")], { evidenceURI: "x".repeat(129) }))
      .to.be.revertedWithCustomError(registry, "URITooLong");
    await expect(register(registry, verifier, owner, [cell("credits")], { credits: 0 }))
      .to.be.revertedWithCustomError(registry, "InvalidCredits");
    await expect(register(registry, verifier, owner, [cell("too-many-credits")], { credits: 1_000_001 }))
      .to.be.revertedWithCustomError(registry, "InvalidCredits");
    await expect(register(registry, verifier, owner, [cell("hash")], { evidenceHash: ethers.ZeroHash }))
      .to.be.revertedWithCustomError(registry, "InvalidEvidenceHash");
    await expect(registry.checkRegion([])).to.be.revertedWithCustomError(registry, "InvalidCellCount");
    await expect(registry.checkRegion(tooManyCells)).to.be.revertedWithCustomError(registry, "InvalidCellCount");
  });

  it("rejects invalid constructor configuration and unknown project IDs", async function () {
    const [admin] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("CarbonRegistry");
    await expect(Registry.deploy(ethers.ZeroAddress, SCORE_THRESHOLD, ""))
      .to.be.revertedWithCustomError(Registry, "AccessControlInvalidDefaultAdmin");
    await expect(Registry.deploy(admin.address, 49, ""))
      .to.be.revertedWithCustomError(Registry, "InvalidThreshold");

    const { registry } = await deployRegistry();
    await expect(registry.getProject(0)).to.be.revertedWithCustomError(registry, "ProjectNotFound");
  });

  it("rejects a zero owner", async function () {
    const { registry, verifier } = await deployRegistry();
    await expect(register(registry, verifier, ethers.ZeroAddress, [cell("zero")]))
      .to.be.revertedWithCustomError(registry, "ZeroAddress");
  });

  it("limits score threshold updates to the default admin and valid range", async function () {
    const { registry, admin, verifier } = await deployRegistry();
    await expect(registry.connect(verifier).setScoreThreshold(75))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    await expect(registry.connect(admin).setScoreThreshold(49))
      .to.be.revertedWithCustomError(registry, "InvalidThreshold");
    await expect(registry.connect(admin).setScoreThreshold(96))
      .to.be.revertedWithCustomError(registry, "InvalidThreshold");
    await expect(registry.connect(admin).setScoreThreshold(75))
      .to.emit(registry, "ScoreThresholdUpdated")
      .withArgs(70, 75);
    expect(await registry.scoreThreshold()).to.equal(75);
    await registry.connect(admin).setScoreThreshold(50);
    expect(await registry.scoreThreshold()).to.equal(50);
    await registry.connect(admin).setScoreThreshold(95);
    expect(await registry.scoreThreshold()).to.equal(95);
  });

  it("uses delayed two-step default-admin transfer", async function () {
    const { registry, admin, nextAdmin } = await deployRegistry();
    await registry.connect(admin).beginDefaultAdminTransfer(nextAdmin.address);
    await expect(registry.connect(nextAdmin).acceptDefaultAdminTransfer()).to.be.revertedWithCustomError(
      registry,
      "AccessControlEnforcedDefaultAdminDelay"
    );
    await time.increase(24 * 60 * 60);
    await registry.connect(nextAdmin).acceptDefaultAdminTransfer();
    const adminRole = await registry.DEFAULT_ADMIN_ROLE();
    expect(await registry.hasRole(adminRole, nextAdmin.address)).to.equal(true);
    expect(await registry.hasRole(adminRole, admin.address)).to.equal(false);
  });

  it("blocks ERC-1155 receiver reentrancy after recording the original project", async function () {
    const { registry, admin, verifierRole } = await deployRegistry();
    const Receiver = await ethers.getContractFactory("ReentrantReceiver");
    const receiver = await Receiver.deploy(await registry.getAddress(), cell("reentry-cell"));
    await receiver.waitForDeployment();
    await registry.connect(admin).grantRole(verifierRole, await receiver.getAddress());

    await register(registry, admin, await receiver.getAddress(), [cell("outer")]);
    expect(await receiver.reentryAttempted()).to.equal(true);
    expect(await receiver.reentrySucceeded()).to.equal(false);
    expect(await registry.projectCount()).to.equal(1);
    expect(await registry.cellProject(cell("reentry-cell"))).to.equal(0);
  });

  it("exercises the malicious receiver's batch and ERC-165 callbacks", async function () {
    const { registry } = await deployRegistry();
    const Receiver = await ethers.getContractFactory("ReentrantReceiver");
    const receiver = await Receiver.deploy(await registry.getAddress(), cell("receiver-callback"));
    await receiver.waitForDeployment();

    expect(
      await receiver.onERC1155BatchReceived(ethers.ZeroAddress, ethers.ZeroAddress, [], [], "0x")
    ).to.equal("0xbc197c81");
    expect(await receiver.supportsInterface("0x4e2312e0")).to.equal(true);
    expect(await receiver.supportsInterface("0xffffffff")).to.equal(false);
  });

  it("preserves registry invariants across deterministic fuzz-style inputs", async function () {
    const { registry, verifier, owner } = await deployRegistry();
    for (let index = 0; index < 12; index += 1) {
      const cells = Array.from({ length: (index % 5) + 1 }, (_, cellIndex) => cell(`fuzz-${index}-${cellIndex}`));
      const score = 70 + (index % 31);
      const credits = BigInt(index + 1);
      await register(registry, verifier, owner, cells, { name: `Project ${index}`, score, credits });
      expect(await registry.cellProject(cells[0])).to.equal(BigInt(index + 1));
      expect(await registry.balanceOf(owner.address, index)).to.equal(credits);
    }
    expect(await registry.projectCount()).to.equal(12);
  });

  it("preserves registry invariants across seeded randomized valid registrations", async function () {
    const { registry, verifier, owner } = await deployRegistry();
    const random = seededRandom(0xc0ffee);
    const registeredCells = [];
    const projectCount = 20;

    for (let projectId = 0; projectId < projectCount; projectId += 1) {
      const cellCount = randomInt(random, 1, 8);
      const cells = Array.from({ length: cellCount }, (_, cellIndex) =>
        cell(`seeded-valid-${projectId}-${cellIndex}-${random()}`)
      );
      const credits = randomInt(random, 1, 1000);
      const score = randomInt(random, SCORE_THRESHOLD, 100);

      await register(registry, verifier, owner, cells, {
        name: `Seeded project ${projectId}`,
        score,
        credits
      });

      for (const regionCell of cells) {
        expect(await registry.cellProject(regionCell)).to.equal(BigInt(projectId + 1));
        registeredCells.push(regionCell);
      }
      expect(await registry.balanceOf(owner.address, projectId)).to.equal(BigInt(credits));
    }

    expect(await registry.projectCount()).to.equal(BigInt(projectCount));
    const sample = registeredCells.filter((_, index) => index % 7 === 0);
    expect(await registry.checkRegion(sample)).to.deep.equal([false, sample[0]]);
  });

  it("rejects seeded randomized overlaps without changing project state", async function () {
    const { registry, verifier, owner, other } = await deployRegistry();
    const random = seededRandom(0x5eed1234);
    const existingProjects = [];
    const projectCount = 16;

    for (let projectId = 0; projectId < projectCount; projectId += 1) {
      const cells = Array.from(
        { length: randomInt(random, 1, 6) },
        (_, cellIndex) => cell(`seeded-overlap-${projectId}-${cellIndex}-${random()}`)
      );
      existingProjects.push(cells);
      await register(registry, verifier, owner, cells, { name: `Existing ${projectId}` });
    }

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const existing = existingProjects[randomInt(random, 0, existingProjects.length - 1)];
      const conflict = existing[randomInt(random, 0, existing.length - 1)];
      const proposed = [cell(`seeded-new-${attempt}-${random()}`), conflict];

      await expect(register(registry, verifier, other, proposed))
        .to.be.revertedWithCustomError(registry, "DuplicateRegion")
        .withArgs(conflict);
      expect(await registry.projectCount()).to.equal(BigInt(projectCount));
      expect(await registry.cellProject(proposed[0])).to.equal(0);
    }
  });
});
