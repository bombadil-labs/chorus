// Chorus — memory for agents, built on Rhizomatic. Many voices, one piece.
// An agent is a keypair, a reactor, and a policy; everything else is vocabulary and ergonomics.

export {
  ChorusAgent,
  beliefPointers,
  surviving,
  type AgentOptions,
  type BeliefInput,
  type BeliefReceipt,
  type RecallOptions,
} from "./agent.js";
export {
  ChorusAdjudicator,
  type AdjudicatorOptions,
  type Candidate,
  type Judge,
} from "./adjudicator.js";
export {
  decide,
  decisionBasisIds,
  replayDecision,
  viewBasis,
  type Decision,
  type DecisionInput,
  type Replay,
} from "./decisions.js";
export {
  briefing,
  rehydrateTrust,
  type Briefing,
  type BriefingScope,
  type SessionSummary,
} from "./briefing.js";
export { startConsole, type ConsoleHandle, type ConsoleOptions } from "./console.js";
export { startHttpServer, type HttpServerHandle, type HttpServerOptions } from "./mcp-http.js";
export { declareConcept, slotId } from "./concepts.js";
export {
  GqlRegistry,
  prepareGql,
  queryGql,
  queryGqlSync,
  type GqlResult,
  type PreparedGql,
  type PrepareGqlOptions,
} from "./gql.js";
export {
  ROLE_SAME,
  ROLE_SAME_REASON,
  recallUnified,
  sameAsClass,
  sameAsPointers,
  search,
  topics,
  type SearchHit,
  type Topic,
} from "./discovery.js";
export {
  CTX_IDENTITY,
  ROLE_ID_MODE,
  ROLE_ID_MODEL,
  ROLE_ID_PURPOSE,
  ROLE_ID_SESSION,
  ROLE_ID_STARTED,
  ROLE_ID_SURFACE,
  ROLE_ID_TOPIC,
  deriveSeed,
  identityAt,
  identityIndex,
  identityIntroductions,
  identityPointers,
  sessionEntity,
  sessionSeed,
  userSeed,
  type AuthorIdentity,
  type SessionIdentity,
} from "./identity.js";
export {
  Librarian,
  MockEmbeddingModel,
  VOCABULARY_ROOT,
  cosine,
  type EmbeddingModel,
  type LibrarianOptions,
} from "./librarian.js";
export {
  ROLE_MSG_ABOUT,
  ROLE_MSG_ACK,
  ROLE_MSG_ACK_NOTE,
  ROLE_MSG_BODY,
  ROLE_MSG_RE,
  ROLE_MSG_TO_AUTHOR,
  ROLE_MSG_TO_MODEL,
  ROLE_MSG_TO_SESSION,
  ROLE_MSG_TO_SURFACE,
  ROLE_MSG_TO_TOPIC,
  ROLE_MSG_TO_USER,
  ackPointers,
  inbox,
  messagePointers,
  type MessageAddress,
  type MessageView,
  type PostInput,
  type Recipient,
} from "./messages.js";
export { latest, trustFirst, everything, disagreements } from "./policies.js";
export { SharedStore, JsonlStore } from "./shared-store.js";
export { SqliteStore, betterSqliteAvailable } from "./sqlite-store.js";
export { NodeSqliteStore, nodeSqliteAvailable } from "./node-sqlite-store.js";
export {
  availableDriver,
  createBackend,
  backendFromEnv,
  backendForPath,
  defaultBackendKind,
  resolveEnvStore,
  type StoreBackend,
  type BackendKind,
} from "./store-tier.js";
export {
  Store,
  StoreRegistry,
  storeSeed,
  MANIFEST_FORMAT_VERSION,
  type StoreManifest,
  type StoreTier,
  type AdoptResult,
} from "./stores.js";
export { migrateJsonlToSqlite, type MigrationResult } from "./migrate.js";
export {
  chorusHome,
  configPath,
  storesRoot,
  loadConfig,
  initChorusHome,
  resolveMasterSeed,
  userAuthorOf,
  type ChorusConfig,
  type InitResult,
} from "./config.js";
export { backlinks, type Backlink } from "./store-reads.js";
export { loadPack, restore, savePack } from "./store.js";
export {
  BELIEF_KINDS,
  CHORUS_PREFIX,
  ROLE_ABOUT,
  ROLE_CONFIDENCE,
  ROLE_KIND,
  ROLE_SOURCE,
  ROLE_VALUE,
  type BeliefKind,
} from "./vocab.js";
export {
  BruteVectorIndex,
  SqliteVecIndex,
  openVectorIndex,
  similarTerms,
  type VectorHit,
  type VectorIndex,
} from "./similarity.js";
export { EncryptedSqliteStore, storeKeyHex } from "./encrypted-store.js";
export { computeVitals, type Vitals } from "./vitals.js";
export { diffBeliefs, agentAsOf, type BeliefDiff, type DiffEntry } from "./belief-diff.js";
export { bisectBelief, type BisectResult, type BisectCulprit } from "./bisect.js";
export {
  examinerSeed,
  introduceExaminer,
  introduceVoice,
  testifyVitals,
  type Testimony,
} from "./examiner.js";
export {
  ROLE_REVIEW_OF,
  ROLE_REVIEW_VERDICT,
  reviewDecisions,
  verdictsOnFile,
  type ReviewFinding,
  type ReviewReport,
} from "./review.js";
export {
  ROLE_CHALLENGE_OF,
  ROLE_CHALLENGE_VERDICT,
  challengeStale,
  type Challenge,
  type ChallengeReport,
} from "./challenges.js";
export {
  ROLE_CONTRADICTION_VERDICT,
  embeddingSimilarity,
  lexicalSimilarity,
  mineContradictions,
  type ContradictionPair,
  type ContradictionReport,
  type Similarity,
} from "./contradictions.js";
export {
  DOUBT_PREFIX,
  ROLE_DOUBT_OF,
  skepticPass,
  skepticSeed,
  type Doubt,
  type SkepticReport,
  type Withdrawal,
} from "./skeptic.js";
