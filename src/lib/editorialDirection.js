import * as directionModule from '../../platform-generator/lib/editorial-direction.js';

export const EditorialDirection=directionModule.resolve?directionModule:directionModule.default?.resolve?directionModule.default:globalThis.EditorialDirection;
