import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PARTY_WORKFLOW, normalizePartyWorkflow, findPartyWorkflowTransition, getPartyOrderStage } from './partyWorkflow.js'

test('workflow validates references and does not silently change stable stage identifiers', () => {
  const workflow = normalizePartyWorkflow(DEFAULT_PARTY_WORKFLOW)
  assert.equal(workflow.initialStageId, 'new')
  assert.throws(() => normalizePartyWorkflow({ ...workflow, initialStageId: 'missing' }), /начальный этап/)
  assert.throws(() => normalizePartyWorkflow({ ...workflow, stages: [...workflow.stages, workflow.stages[0]] }), /уникальные/)
  assert.throws(() => normalizePartyWorkflow({ ...workflow, transitions: [...workflow.transitions, workflow.transitions[0]] }), /несколько/)
})

test('transition grants use position identifiers and never the name of a position', () => {
  const roleId = '123456789012345678901234'
  const workflow = { ...DEFAULT_PARTY_WORKFLOW, transitions: [{ fromStageId: 'new', toStageId: 'discussion', roleIds: [roleId] }] }
  assert.equal(findPartyWorkflowTransition({ workflow, order: {}, toStageId: 'discussion', context: { role: 'performer', position: { _id: 'other', title: 'Менеджер' } } }), null)
  assert.ok(findPartyWorkflowTransition({ workflow, order: {}, toStageId: 'discussion', context: { role: 'performer', position: { _id: roleId } } }))
  assert.equal(findPartyWorkflowTransition({ workflow, order: {}, toStageId: 'review', context: { role: 'owner' } }), null)
})

test('old orders resolve to the configured initial stage without losing their system status', () => {
  const order = { status: 'active' }
  assert.equal(getPartyOrderStage(order, DEFAULT_PARTY_WORKFLOW), 'new')
  assert.equal(order.status, 'active')
})
