//@ts-nocheck
import { V1, V2 } from '../src'
import { test } from './test'

const g1 = test(V1.Graph)
globalThis.g1 = g1;
debugger
const g2 = test(V2.Graph)
globalThis.g2 = g2;