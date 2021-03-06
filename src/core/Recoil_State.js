/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+recoil
 * @flow strict
 * @format
 */
'use strict';

import type {Loadable} from '../adt/Recoil_Loadable';
import type {Graph} from './Recoil_GraphTypes';
import type {ComponentID, NodeKey, Version} from './Recoil_Keys';
export type {ComponentID, NodeKey, Version} from './Recoil_Keys';

const {graph} = require('./Recoil_Graph');

// flowlint-next-line unclear-type:off
export type AtomValues = Map<NodeKey, Loadable<any>>;

type ComponentCallback = TreeState => void;

// TreeState represents the state of a rendered React tree. As such, multiple
// TreeStates may be in play at one time due to concurrent rendering, and each
// TreeState is immutable.
export type TreeState = $ReadOnly<{
  // Information about the TreeState itself:
  version: Version,
  transactionMetadata: {...},

  // Atoms:
  dirtyAtoms: Set<NodeKey>,
  atomValues: AtomValues,
  nonvalidatedAtoms: Map<NodeKey, mixed>,
}>;

// StoreState represents the state of a Recoil context. It is global and mutable.
// It is updated only during effects, except that the nextTree property is updated
// when atom values change and async requests resolve, and suspendedComponentResolvers
// is updated when components are suspended.
export type StoreState = {
  // The "current" TreeState being either directly read from (legacy) or passed
  // to useMutableSource (when in use). It is replaced with nextTree when
  // a transaction is completed or async request finishes:
  currentTree: TreeState,

  // The TreeState that is written to when during the course of a transaction
  // (generally equal to a React batch) when atom values are updated.
  nextTree: null | TreeState,

  // Node lifetimes
  knownAtoms: Set<NodeKey>,
  knownSelectors: Set<NodeKey>,

  // Which state versions are being read by a given component. (COMMIT/SUSPEND)
  // Added to when components commit or suspend after reading a version.
  // Removed from when components (1) unmount (2) commit another version
  // or (3) wake from suspense.
  +versionsUsedByComponent: Map<ComponentID, Version>,

  // Which components depend on a specific node. (COMMIT/SUSPEND updates).
  +nodeToComponentSubscriptions: Map<
    NodeKey,
    Map<ComponentID, [string, ComponentCallback]>,
  >,

  // Which nodes depend on which. A pure function of the version (atom state)
  // and nodeToComponentSubscriptions. Recomputed when:
  // (1) A transaction occurs (atoms written) or
  // (2) An async request is completed or
  // (3) (IN FUTURE) nodeToComponentSubscriptions is updated
  // How incremental computation is performed:
  // In case of transactions, we walk downward from the updated atoms
  // In case of async request completion, we walk downward from updated selector
  // In (future) case of component subscriptions updated, we walk upwards from
  // component and then downward from any no-longer-depended on nodes
  +graphsByVersion: Map<Version, Graph>,
  // Side note: it would be useful to consider async request completion as
  // another type of transaction since it should increase version etc. and many
  // things have to happen in both of these cases.

  // For observing transactions:
  +transactionSubscriptions: Map<number, (Store) => void>,
  +nodeTransactionSubscriptions: Map<NodeKey, Array<(Store) => void>>,

  // Callbacks to render external components that are subscribed to nodes
  // These are executed at the end of the transaction or asynchronously.
  +queuedComponentCallbacks: Array<ComponentCallback>,

  // Promise resolvers to wake any components we suspended with React Suspense
  +suspendedComponentResolvers: Set<() => void>,
};

// The Store is just the interface that is made available via the context.
// It is constant within a given Recoil root.
export type Store = $ReadOnly<{
  getState: () => StoreState,
  replaceState: ((TreeState) => TreeState) => void,
  getGraph: Version => Graph,
  subscribeToTransactions: ((Store) => void, ?NodeKey) => {release: () => void},
  addTransactionMetadata: ({...}) => void,
  fireNodeSubscriptions: (
    updatedNodes: $ReadOnlySet<NodeKey>,
    when: 'enqueue' | 'now',
  ) => void,
}>;

export type StoreRef = {
  current: Store,
};

let nextTreeStateVersion = 0;
const getNextTreeStateVersion = (): Version => nextTreeStateVersion++;

function makeEmptyTreeState(): TreeState {
  return {
    version: getNextTreeStateVersion(),
    transactionMetadata: {},
    dirtyAtoms: new Set(),
    atomValues: new Map(),
    nonvalidatedAtoms: new Map(),
  };
}

function makeStoreState(treeState: TreeState): StoreState {
  return {
    currentTree: treeState,
    nextTree: null,
    knownAtoms: new Set(),
    knownSelectors: new Set(),
    transactionSubscriptions: new Map(),
    nodeTransactionSubscriptions: new Map(),
    queuedComponentCallbacks: [],
    suspendedComponentResolvers: new Set(),
    nodeToComponentSubscriptions: new Map(),
    graphsByVersion: new Map().set(treeState.version, graph()),
    versionsUsedByComponent: new Map(),
  };
}

function makeEmptyStoreState(): StoreState {
  return makeStoreState(makeEmptyTreeState());
}

module.exports = {
  makeEmptyTreeState,
  makeEmptyStoreState,
  makeStoreState,
  getNextTreeStateVersion,
};
