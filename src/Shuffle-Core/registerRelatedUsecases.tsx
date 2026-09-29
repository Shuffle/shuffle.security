/**
 * Registers Shuffle-Core's AppRelatedUsecases into the Shuffle-MCPs render
 * slot, so AppDetailContent (which lives in the lower-level Shuffle-MCPs
 * package and must not depend on Shuffle-Core) can render the related-usecases
 * section without importing it.
 *
 * Imported for its side effect from Shuffle-Core's entry (index.tsx). The
 * setter is imported from the published `@shuffleio/shuffle-mcps` barrel (not
 * the `@/Shuffle-MCPs/*` source alias) on purpose: that guarantees we register
 * on the same module instance the mcps package itself reads from, both in the
 * host app (where the barrel is aliased to the same source) and in downstream
 * apps consuming the two published packages.
 */
import React from 'react';
import { setRelatedUsecasesRenderer } from '@shuffleio/shuffle-mcps';
import AppRelatedUsecases from './components/AppRelatedUsecases';

setRelatedUsecasesRenderer((props) => <AppRelatedUsecases {...props} />);
