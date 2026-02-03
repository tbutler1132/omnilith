// Seed data for development
//
// Populates the in-memory database with realistic test data
// for UI development and testing.

import type { RepositoryContext } from '@omnilith/repositories';
import type { PageDoc } from '@omnilith/protocol';

/**
 * Seed the database with demo data for development.
 */
export async function seedDemoData(repos: RepositoryContext): Promise<void> {
  // Create a subject node (the "user")
  const subjectNode = await repos.nodes.create({
    id: 'node-subject',
    kind: 'subject',
    name: 'Demo User',
    description: 'A demo subject node for development',
  });

  // Create an agent node
  const agentNode = await repos.nodes.create({
    id: 'node-agent',
    kind: 'agent',
    name: 'Assistant Agent',
    description: 'An AI assistant agent',
  });

  // Create edge between subject and agent (maintains = subject maintains/manages the agent)
  await repos.nodes.addEdge({
    id: 'edge-delegation',
    fromNodeId: subjectNode.id,
    toNodeId: agentNode.id,
    type: 'maintains',
    metadata: { maxRiskLevel: 'medium' },
  });

  // Create some variables
  const sleepVar = await repos.variables.create({
    id: 'var-sleep',
    nodeId: subjectNode.id,
    key: 'sleep_quality',
    title: 'Sleep Quality',
    description: 'Overall sleep quality score',
    kind: 'continuous',
    unit: 'score',
    viableRange: { min: 4, max: 10 },
    preferredRange: { min: 7, max: 9 },
    computeSpecs: [
      {
        id: 'spec-sleep-avg',
        observationTypes: ['health.sleep'],
        aggregation: 'avg',
        window: { hours: 168 }, // 1 week
        confidence: 0.8,
      },
    ],
  });

  const _energyVar = await repos.variables.create({
    id: 'var-energy',
    nodeId: subjectNode.id,
    key: 'energy_level',
    title: 'Energy Level',
    description: 'Daily energy level',
    kind: 'continuous',
    unit: 'score',
    viableRange: { min: 3, max: 10 },
    preferredRange: { min: 6, max: 8 },
    computeSpecs: [
      {
        id: 'spec-energy-latest',
        observationTypes: ['health.energy'],
        aggregation: 'latest',
        window: { hours: 24 },
        confidence: 0.9,
      },
    ],
  });

  const focusVar = await repos.variables.create({
    id: 'var-focus',
    nodeId: subjectNode.id,
    key: 'focus_time',
    title: 'Focus Time',
    description: 'Hours of deep focus work',
    kind: 'continuous',
    unit: 'hours',
    viableRange: { min: 2, max: 8 },
    preferredRange: { min: 4, max: 6 },
    computeSpecs: [
      {
        id: 'spec-focus-sum',
        observationTypes: ['work.focus'],
        aggregation: 'sum',
        window: { hours: 24 },
        confidence: 0.95,
      },
    ],
  });

  // Create some observations
  const now = new Date();
  const observations = [
    {
      type: 'health.sleep',
      payload: { quality: 7, hours: 7.5, deep_sleep_hours: 2.1 },
      daysAgo: 0,
    },
    {
      type: 'health.sleep',
      payload: { quality: 6, hours: 6.5, deep_sleep_hours: 1.5 },
      daysAgo: 1,
    },
    {
      type: 'health.sleep',
      payload: { quality: 8, hours: 8, deep_sleep_hours: 2.5 },
      daysAgo: 2,
    },
    {
      type: 'health.energy',
      payload: { level: 7, time: '10:00' },
      daysAgo: 0,
    },
    {
      type: 'health.energy',
      payload: { level: 5, time: '15:00' },
      daysAgo: 0,
    },
    {
      type: 'work.focus',
      payload: { duration: 2.5, task: 'coding' },
      daysAgo: 0,
    },
    {
      type: 'work.focus',
      payload: { duration: 1.5, task: 'review' },
      daysAgo: 0,
    },
    {
      type: 'work.focus',
      payload: { duration: 3, task: 'coding' },
      daysAgo: 1,
    },
  ];

  for (const obs of observations) {
    const timestamp = new Date(now);
    timestamp.setDate(timestamp.getDate() - obs.daysAgo);
    timestamp.setHours(9 + Math.floor(Math.random() * 8));

    await repos.observations.append({
      nodeId: subjectNode.id,
      type: obs.type,
      timestamp: timestamp.toISOString(),
      payload: obs.payload,
      provenance: {
        sourceId: 'seed-data',
        method: 'manual_entry',
        confidence: 1.0,
      },
    });
  }

  // Create an active episode
  const episodeStart = new Date(now);
  episodeStart.setDate(episodeStart.getDate() - 3);
  const episodeEnd = new Date(now);
  episodeEnd.setDate(episodeEnd.getDate() + 4);

  await repos.episodes.create({
    id: 'episode-sleep',
    nodeId: subjectNode.id,
    title: 'Sleep Improvement Week',
    description: 'Focus on improving sleep quality through consistent bedtime and reduced screen time.',
    kind: 'regulatory',
    status: 'active',
    variables: [
      {
        variableId: sleepVar.id,
        intent: 'increase',
      },
    ],
    startsAt: episodeStart.toISOString(),
    endsAt: episodeEnd.toISOString(),
  });

  // Create a planned episode
  const futureStart = new Date(now);
  futureStart.setDate(futureStart.getDate() + 7);
  const futureEnd = new Date(now);
  futureEnd.setDate(futureEnd.getDate() + 14);

  await repos.episodes.create({
    id: 'episode-focus',
    nodeId: subjectNode.id,
    title: 'Deep Work Sprint',
    description: 'Explore increasing focus time through time-blocking techniques.',
    kind: 'exploratory',
    status: 'planned',
    variables: [
      {
        variableId: focusVar.id,
        intent: 'increase',
      },
    ],
    startsAt: futureStart.toISOString(),
    endsAt: futureEnd.toISOString(),
  });

  // Create some artifacts
  const journalPage: PageDoc = {
    version: 1,
    blocks: [
      {
        id: 'block-1',
        type: 'heading',
        content: { level: 1, text: 'Weekly Reflection' },
      },
      {
        id: 'block-2',
        type: 'paragraph',
        content: {
          text: 'This week has been a mix of progress and challenges. Sleep has been improving since starting the new routine.',
        },
      },
      {
        id: 'block-3',
        type: 'heading',
        content: { level: 2, text: 'Key Wins' },
      },
      {
        id: 'block-4',
        type: 'list',
        content: {
          style: 'bullet',
          items: [
            'Consistent 10pm bedtime 5/7 days',
            'Morning energy levels noticeably better',
            'Completed major project milestone',
          ],
        },
      },
      {
        id: 'block-5',
        type: 'heading',
        content: { level: 2, text: 'Areas for Improvement' },
      },
      {
        id: 'block-6',
        type: 'paragraph',
        content: {
          text: 'Still struggling with afternoon energy dips. May need to adjust lunch timing or add a short walk.',
        },
      },
    ],
  };

  await repos.artifacts.create(
    {
      id: 'artifact-journal',
      nodeId: subjectNode.id,
      title: 'Weekly Reflection - Week 5',
      about: 'Personal reflection on the week',
      page: journalPage,
      status: 'active',
    },
    {
      authorNodeId: subjectNode.id,
      message: 'Initial draft',
    }
  );

  const notesPage: PageDoc = {
    version: 1,
    blocks: [
      {
        id: 'block-1',
        type: 'heading',
        content: { level: 1, text: 'Sleep Protocol' },
      },
      {
        id: 'block-2',
        type: 'paragraph',
        content: {
          text: 'Evidence-based practices for improving sleep quality.',
        },
      },
      {
        id: 'block-3',
        type: 'list',
        content: {
          style: 'numbered',
          items: [
            'Consistent sleep/wake times (even weekends)',
            'No screens 1 hour before bed',
            'Cool room temperature (65-68°F)',
            'No caffeine after 2pm',
            'Morning sunlight exposure within 30 minutes of waking',
          ],
        },
      },
      {
        id: 'block-4',
        type: 'callout',
        content: {
          type: 'info',
          text: 'Research shows it takes about 2-3 weeks to establish a new sleep routine.',
        },
      },
    ],
  };

  await repos.artifacts.create(
    {
      id: 'artifact-protocol',
      nodeId: subjectNode.id,
      title: 'Sleep Protocol',
      about: 'Guidelines for sleep improvement',
      page: notesPage,
      status: 'published',
    },
    {
      authorNodeId: subjectNode.id,
      message: 'Published sleep protocol',
    }
  );

  // Create some surfaces
  await repos.surfaces.create({
    id: 'surface-dashboard',
    nodeId: subjectNode.id,
    kind: 'page',
    title: 'Dashboard',
    visibility: 'private',
    entry: {
      query: {
        status: ['active'],
        limit: 10,
      },
    },
    mapPosition: { left: '10%', top: '10%' },
    category: 'core',
  });

  await repos.surfaces.create({
    id: 'surface-journal',
    nodeId: subjectNode.id,
    kind: 'page',
    title: 'Journal',
    visibility: 'private',
    entry: {
      artifactId: 'artifact-journal',
    },
    mapPosition: { left: '30%', top: '20%' },
    category: 'content',
  });

  await repos.surfaces.create({
    id: 'surface-protocols',
    nodeId: subjectNode.id,
    kind: 'gallery',
    title: 'Protocols',
    visibility: 'node_members',
    entry: {
      query: {
        status: ['published'],
        limit: 20,
      },
    },
    mapPosition: { left: '50%', top: '15%' },
    category: 'content',
  });

  await repos.surfaces.create({
    id: 'surface-variables',
    nodeId: subjectNode.id,
    kind: 'workshop',
    title: 'Variables',
    visibility: 'private',
    entry: {},
    mapPosition: { left: '70%', top: '25%' },
    category: 'system',
  });

  // Create a pending action run
  await repos.actionRuns.create({
    id: 'run-pending',
    nodeId: subjectNode.id,
    proposedBy: {
      policyId: 'policy-sleep-reminder',
      observationId: 'obs-trigger',
    },
    action: {
      actionType: 'send_notification',
      params: {
        title: 'Bedtime Reminder',
        body: 'It\'s 9:30pm - time to start winding down for your 10pm bedtime.',
        priority: 'normal',
      },
    },
    riskLevel: 'low',
  });

  await repos.actionRuns.create({
    id: 'run-pending-medium',
    nodeId: subjectNode.id,
    proposedBy: {
      policyId: 'policy-schedule-adjust',
      observationId: 'obs-trigger-2',
    },
    action: {
      actionType: 'update_calendar',
      params: {
        eventId: 'meeting-123',
        action: 'reschedule',
        newTime: '14:00',
        reason: 'Low energy detected in afternoon slot',
      },
    },
    riskLevel: 'medium',
  });

  // Create a simple policy
  await repos.policies.create({
    id: 'policy-sleep-reminder',
    nodeId: subjectNode.id,
    name: 'Bedtime Reminder',
    description: 'Send a reminder 30 minutes before target bedtime',
    priority: 50,
    enabled: true,
    triggers: ['system.time'], // Triggers are observation type patterns
    implementation: {
      kind: 'typescript',
      code: `
        // Check if it's 9:30pm
        const hour = new Date(ctx.observation.timestamp).getHours();
        const minute = new Date(ctx.observation.timestamp).getMinutes();
        if (hour === 21 && minute === 30) {
          return [{
            type: 'propose_action',
            action: {
              type: 'send_notification',
              parameters: {
                title: 'Bedtime Reminder',
                body: "It's 9:30pm - time to start winding down.",
              },
            },
            riskLevel: 'low',
          }];
        }
        return [];
      `,
    },
  });

  // Create an entity type and entity
  const projectType = await repos.entities.createType({
    id: 'type-project',
    nodeId: subjectNode.id,
    typeName: 'project',
    title: 'Project',
    description: 'A project being worked on',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        status: { type: 'string', enum: ['active', 'completed', 'paused'] },
        progress: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
    eventTypes: ['status_changed', 'progress_updated', 'note_added'],
  });

  await repos.entities.create(
    {
      id: 'entity-project-1',
      nodeId: subjectNode.id,
      typeId: projectType.id,
      initialState: {
        name: 'Omnilith Web',
        status: 'active',
        progress: 75,
      },
    },
    subjectNode.id
  );

  // Create a grant
  await repos.grants.create({
    id: 'grant-agent-read',
    granteeNodeId: agentNode.id,
    resourceType: 'node',
    resourceId: subjectNode.id,
    scopes: ['read', 'observe'],
    grantorNodeId: subjectNode.id,
  });

  console.log('Seed data created successfully');
}
