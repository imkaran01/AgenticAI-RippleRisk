// RippleRisk API: wraps the EconomicGraph and EconomicEngine extracted from
// RippleRisk_Integrated_Corrected.html. No third-party npm packages required.
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');

class EconomicGraph {
  constructor() {
    this.sectors = new Map();
    this.edges = [];
    this.adjacency = new Map();
    this.reverseAdj = new Map();
  }

  addSector(id, data) {
    this.sectors.set(id, { id, ...data });
    if (!this.adjacency.has(id)) this.adjacency.set(id, []);
    if (!this.reverseAdj.has(id)) this.reverseAdj.set(id, []);
  }

  addEdge(from, to, weight, type) {
    const edge = { from, to, weight, type, id: `${from}->${to}` };
    this.edges.push(edge);
    if (!this.adjacency.has(from)) this.adjacency.set(from, []);
    this.adjacency.get(from).push(edge);
    if (!this.reverseAdj.has(to)) this.reverseAdj.set(to, []);
    this.reverseAdj.get(to).push(edge);
  }

  getNeighbors(id) {
    return this.adjacency.get(id) || [];
  }

  getUpstream(id) {
    return this.reverseAdj.get(id) || [];
  }

  getBFSOrder(startId) {
    const visited = new Set();
    const order = [];
    const queue = [{ id: startId, ring: 0, parent: null }];
    visited.add(startId);

    while (queue.length > 0) {
      const { id, ring, parent } = queue.shift();
      order.push({ id, ring, parent });

      const neighbors = this.getNeighbors(id);
      for (let i = 0; i < neighbors.length; i++) {
        const edge = neighbors[i];
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({ id: edge.to, ring: ring + 1, parent: id });
        }
      }
    }

    return order;
  }

  getPath(startId, endId) {
    if (startId === endId) return [startId];

    const visited = new Set();
    const parentMap = new Map();
    const queue = [startId];
    visited.add(startId);
    parentMap.set(startId, null);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === endId) {
        const path = [];
        let node = endId;
        while (node !== null) {
          path.unshift(node);
          node = parentMap.get(node);
        }
        return path;
      }

      const neighbors = this.getNeighbors(current);
      for (let i = 0; i < neighbors.length; i++) {
        const edge = neighbors[i];
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          parentMap.set(edge.to, current);
          queue.push(edge.to);
        }
      }
    }

    return [startId];
  }

  getShortestPathDijkstra(startId, endId) {
    if (startId === endId) return [startId];

    const dist = new Map();
    const prev = new Map();
    const pq = [];

    this.sectors.forEach((_, id) => {
      dist.set(id, Infinity);
    });
    dist.set(startId, 0);
    pq.push({ id: startId, d: 0 });

    while (pq.length > 0) {
      pq.sort((a, b) => a.d - b.d);
      const { id: u, d } = pq.shift();

      if (d > dist.get(u)) continue;
      if (u === endId) break;

      const neighbors = this.getNeighbors(u);
      for (let i = 0; i < neighbors.length; i++) {
        const edge = neighbors[i];
        const alt = dist.get(u) + (1 - edge.weight);
        if (alt < dist.get(edge.to)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, u);
          pq.push({ id: edge.to, d: alt });
        }
      }
    }

    if (!prev.has(endId) && startId !== endId) return [startId];

    const path = [];
    let node = endId;
    while (node !== undefined && node !== null) {
      path.unshift(node);
      node = prev.get(node);
    }

    if (path.length === 0 || path[0] !== startId) return [startId];
    return path;
  }
}


function buildEconomicGraph() {
  const g = new EconomicGraph();

  // ---- SECTORS (30 total across 7 categories) ----
  const sectors = [
    // Energy (4)
    { id: 'crude-oil',    name: 'Crude Oil',              category: 'Energy',          basePrice: 80,     baseDemand: 100, elastD: -0.3,  elastS: 0.2,  incomeElast: 0.1,  passThrough: 0.9  },
    { id: 'natural-gas',  name: 'Natural Gas',            category: 'Energy',          basePrice: 4,      baseDemand: 90,  elastD: -0.4,  elastS: 0.3,  incomeElast: 0.1,  passThrough: 0.85 },
    { id: 'electricity',  name: 'Electricity',            category: 'Energy',          basePrice: 0.12,   baseDemand: 95,  elastD: -0.2,  elastS: 0.15, incomeElast: 0.05, passThrough: 0.7  },
    { id: 'renewables',   name: 'Renewable Energy',       category: 'Energy',          basePrice: 0.08,   baseDemand: 30,  elastD: -0.5,  elastS: 0.6,  incomeElast: 0.2,  passThrough: 0.5  },

    // Transportation (4)
    { id: 'fuel-dist',    name: 'Fuel Distribution',      category: 'Transportation',  basePrice: 3.5,    baseDemand: 85,  elastD: -0.35, elastS: 0.2,  incomeElast: 0.15, passThrough: 0.85 },
    { id: 'airlines',     name: 'Airlines',               category: 'Transportation',  basePrice: 350,    baseDemand: 70,  elastD: -1.2,  elastS: 0.3,  incomeElast: 1.5,  passThrough: 0.6  },
    { id: 'shipping',     name: 'Shipping & Logistics',   category: 'Transportation',  basePrice: 50,     baseDemand: 80,  elastD: -0.4,  elastS: 0.25, incomeElast: 0.3,  passThrough: 0.75 },
    { id: 'public-transit', name: 'Public Transit',       category: 'Transportation',  basePrice: 2.5,    baseDemand: 60,  elastD: -0.3,  elastS: 0.1,  incomeElast: -0.2, passThrough: 0.4  },

    // Agriculture (3)
    { id: 'farming',      name: 'Farming & Crops',        category: 'Agriculture',     basePrice: 200,    baseDemand: 95,  elastD: -0.15, elastS: 0.4,  incomeElast: 0.1,  passThrough: 0.7  },
    { id: 'livestock',    name: 'Livestock',              category: 'Agriculture',     basePrice: 5,      baseDemand: 85,  elastD: -0.25, elastS: 0.3,  incomeElast: 0.3,  passThrough: 0.65 },
    { id: 'fertilizers',  name: 'Fertilizers & Chemicals', category: 'Agriculture',    basePrice: 400,    baseDemand: 70,  elastD: -0.2,  elastS: 0.35, incomeElast: 0.05, passThrough: 0.8  },

    // Manufacturing (5)
    { id: 'automotive',   name: 'Automotive',             category: 'Manufacturing',   basePrice: 35000,  baseDemand: 50,  elastD: -1.5,  elastS: 0.4,  incomeElast: 2.0,  passThrough: 0.55 },
    { id: 'steel',        name: 'Steel & Metals',         category: 'Manufacturing',   basePrice: 800,    baseDemand: 75,  elastD: -0.5,  elastS: 0.3,  incomeElast: 0.2,  passThrough: 0.8  },
    { id: 'textiles',     name: 'Textiles',               category: 'Manufacturing',   basePrice: 15,     baseDemand: 65,  elastD: -0.8,  elastS: 0.5,  incomeElast: 0.6,  passThrough: 0.6  },
    { id: 'electronics',  name: 'Electronics',            category: 'Manufacturing',   basePrice: 500,    baseDemand: 80,  elastD: -1.3,  elastS: 0.5,  incomeElast: 1.2,  passThrough: 0.5  },
    { id: 'pharma',       name: 'Pharmaceuticals',        category: 'Manufacturing',   basePrice: 100,    baseDemand: 90,  elastD: -0.1,  elastS: 0.2,  incomeElast: 0.05, passThrough: 0.3  },

    // Consumer (5)
    { id: 'food-proc',    name: 'Food Processing',        category: 'Consumer',        basePrice: 8,      baseDemand: 95,  elastD: -0.2,  elastS: 0.3,  incomeElast: 0.15, passThrough: 0.7  },
    { id: 'retail',       name: 'Retail',                 category: 'Consumer',        basePrice: 50,     baseDemand: 85,  elastD: -0.7,  elastS: 0.4,  incomeElast: 0.8,  passThrough: 0.6  },
    { id: 'ecommerce',    name: 'E-Commerce',             category: 'Consumer',        basePrice: 45,     baseDemand: 75,  elastD: -0.9,  elastS: 0.6,  incomeElast: 0.9,  passThrough: 0.5  },
    { id: 'consumer-goods', name: 'Consumer Goods',       category: 'Consumer',        basePrice: 25,     baseDemand: 90,  elastD: -0.6,  elastS: 0.4,  incomeElast: 0.7,  passThrough: 0.55 },
    { id: 'restaurants',  name: 'Restaurants & Hospitality', category: 'Consumer',     basePrice: 30,     baseDemand: 70,  elastD: -1.1,  elastS: 0.3,  incomeElast: 1.3,  passThrough: 0.5  },

    // Services (5)
    { id: 'banking',      name: 'Banking & Finance',      category: 'Services',        basePrice: 100,    baseDemand: 80,  elastD: -0.3,  elastS: 0.2,  incomeElast: 0.4,  passThrough: 0.4  },
    { id: 'insurance',    name: 'Insurance',              category: 'Services',        basePrice: 200,    baseDemand: 85,  elastD: -0.2,  elastS: 0.15, incomeElast: 0.3,  passThrough: 0.35 },
    { id: 'real-estate',  name: 'Real Estate',            category: 'Services',        basePrice: 300000, baseDemand: 40,  elastD: -1.0,  elastS: 0.2,  incomeElast: 1.8,  passThrough: 0.45 },
    { id: 'healthcare',   name: 'Healthcare',             category: 'Services',        basePrice: 500,    baseDemand: 95,  elastD: -0.1,  elastS: 0.1,  incomeElast: 0.1,  passThrough: 0.3  },
    { id: 'it-services',  name: 'IT Services',            category: 'Services',        basePrice: 150,    baseDemand: 80,  elastD: -0.6,  elastS: 0.5,  incomeElast: 0.8,  passThrough: 0.4  },

    // Economy (4)
    { id: 'consumer-spending', name: 'Consumer Spending',  category: 'Economy',        basePrice: 1,      baseDemand: 100, elastD: -0.5,  elastS: 0.3,  incomeElast: 1.0,  passThrough: 0.7  },
    { id: 'employment',   name: 'Employment',             category: 'Economy',         basePrice: 1,      baseDemand: 95,  elastD: -0.3,  elastS: 0.2,  incomeElast: 0.5,  passThrough: 0.5  },
    { id: 'inflation',    name: 'Inflation',              category: 'Economy',         basePrice: 1,      baseDemand: 100, elastD: -0.1,  elastS: 0.1,  incomeElast: 0.0,  passThrough: 0.9  },
    { id: 'govt-revenue', name: 'Government Revenue',     category: 'Economy',         basePrice: 1,      baseDemand: 100, elastD: -0.1,  elastS: 0.1,  incomeElast: 0.3,  passThrough: 0.6  },
  ];

  sectors.forEach(s => {
    g.addSector(s.id, {
      name: s.name,
      category: s.category,
      basePrice: s.basePrice,
      baseDemand: s.baseDemand,
      elasticityDemand: s.elastD,
      elasticitySupply: s.elastS,
      incomeElasticity: s.incomeElast,
      passThrough: s.passThrough
    });
  });

  // ---- EDGES (98 total) ----
  const edges = [
    // === Energy chains (18 edges) ===
    ['crude-oil',    'fuel-dist',     0.9,  'input-cost'],
    ['crude-oil',    'airlines',      0.7,  'input-cost'],
    ['crude-oil',    'shipping',      0.65, 'input-cost'],
    ['crude-oil',    'natural-gas',   0.4,  'cross-market'],
    ['crude-oil',    'renewables',    0.3,  'substitution'],
    ['crude-oil',    'fertilizers',   0.6,  'input-cost'],
    ['crude-oil',    'inflation',     0.5,  'cross-market'],
    ['natural-gas',  'electricity',   0.7,  'input-cost'],
    ['natural-gas',  'fertilizers',   0.5,  'input-cost'],
    ['natural-gas',  'steel',         0.4,  'input-cost'],
    ['natural-gas',  'food-proc',     0.3,  'input-cost'],
    ['electricity',  'steel',         0.35, 'input-cost'],
    ['electricity',  'electronics',   0.3,  'input-cost'],
    ['electricity',  'it-services',   0.25, 'input-cost'],
    ['electricity',  'retail',        0.2,  'input-cost'],
    ['electricity',  'ecommerce',     0.2,  'input-cost'],
    ['electricity',  'healthcare',    0.15, 'input-cost'],
    ['renewables',   'electricity',   0.3,  'substitution'],

    // === Transportation chains (13 edges) ===
    ['fuel-dist',    'shipping',      0.8,  'input-cost'],
    ['fuel-dist',    'airlines',      0.6,  'input-cost'],
    ['fuel-dist',    'public-transit', 0.5, 'input-cost'],
    ['fuel-dist',    'automotive',    0.3,  'demand'],
    ['fuel-dist',    'consumer-spending', 0.2, 'income-effect'],
    ['shipping',     'retail',        0.6,  'input-cost'],
    ['shipping',     'ecommerce',     0.65, 'input-cost'],
    ['shipping',     'food-proc',     0.5,  'input-cost'],
    ['shipping',     'consumer-goods', 0.55, 'input-cost'],
    ['shipping',     'electronics',   0.4,  'input-cost'],
    ['shipping',     'textiles',      0.4,  'input-cost'],
    ['shipping',     'farming',       0.35, 'input-cost'],
    ['airlines',     'restaurants',   0.35, 'demand'],

    // === Additional transportation (2 edges) ===
    ['airlines',     'employment',    0.2,  'income-effect'],
    ['public-transit', 'employment',  0.15, 'cross-market'],

    // === Agriculture chains (6 edges) ===
    ['farming',      'food-proc',     0.8,  'input-cost'],
    ['farming',      'livestock',     0.6,  'input-cost'],
    ['farming',      'restaurants',   0.4,  'input-cost'],
    ['livestock',    'food-proc',     0.5,  'input-cost'],
    ['livestock',    'restaurants',   0.35, 'input-cost'],
    ['fertilizers',  'farming',       0.7,  'input-cost'],

    // === Manufacturing chains (12 edges) ===
    ['steel',        'automotive',    0.6,  'input-cost'],
    ['steel',        'real-estate',   0.35, 'input-cost'],
    ['steel',        'electronics',   0.25, 'input-cost'],
    ['automotive',   'insurance',     0.3,  'demand'],
    ['automotive',   'banking',       0.25, 'demand'],
    ['automotive',   'employment',    0.3,  'income-effect'],
    ['electronics',  'it-services',   0.4,  'input-cost'],
    ['electronics',  'ecommerce',     0.3,  'demand'],
    ['electronics',  'consumer-goods', 0.3, 'cross-market'],
    ['textiles',     'retail',        0.4,  'input-cost'],
    ['textiles',     'consumer-goods', 0.45, 'input-cost'],
    ['pharma',       'healthcare',    0.6,  'input-cost'],

    // === Additional manufacturing (1 edge) ===
    ['pharma',       'insurance',     0.3,  'cross-market'],

    // === Consumer chains (12 edges) ===
    ['food-proc',    'retail',        0.5,  'input-cost'],
    ['food-proc',    'restaurants',   0.55, 'input-cost'],
    ['retail',       'employment',    0.4,  'income-effect'],
    ['retail',       'consumer-spending', 0.3, 'demand'],
    ['retail',       'govt-revenue',  0.25, 'cross-market'],
    ['ecommerce',    'retail',        0.4,  'competition'],
    ['ecommerce',    'shipping',      0.3,  'demand'],
    ['ecommerce',    'employment',    0.2,  'income-effect'],
    ['consumer-goods', 'retail',      0.5,  'demand'],
    ['consumer-goods', 'ecommerce',   0.4,  'demand'],
    ['restaurants',  'employment',    0.3,  'income-effect'],
    ['restaurants',  'farming',       0.2,  'demand'],

    // === Services chains (15 edges) ===
    ['banking',      'real-estate',   0.7,  'demand'],
    ['banking',      'automotive',    0.4,  'demand'],
    ['banking',      'consumer-spending', 0.5, 'income-effect'],
    ['banking',      'employment',    0.2,  'income-effect'],
    ['insurance',    'healthcare',    0.3,  'cross-market'],
    ['insurance',    'automotive',    0.2,  'cross-market'],
    ['real-estate',  'banking',       0.3,  'demand'],
    ['real-estate',  'employment',    0.3,  'income-effect'],
    ['real-estate',  'steel',         0.25, 'demand'],
    ['real-estate',  'consumer-spending', 0.2, 'income-effect'],
    ['healthcare',   'pharma',        0.3,  'demand'],
    ['healthcare',   'insurance',     0.35, 'cross-market'],
    ['healthcare',   'employment',    0.2,  'income-effect'],
    ['it-services',  'ecommerce',     0.35, 'input-cost'],
    ['it-services',  'banking',       0.3,  'input-cost'],

    // === Additional services (1 edge) ===
    ['it-services',  'employment',    0.25, 'income-effect'],

    // === Economy-wide chains (18 edges) ===
    ['consumer-spending', 'retail',        0.8,  'demand'],
    ['consumer-spending', 'restaurants',   0.7,  'demand'],
    ['consumer-spending', 'ecommerce',     0.6,  'demand'],
    ['consumer-spending', 'airlines',      0.5,  'demand'],
    ['consumer-spending', 'automotive',    0.5,  'demand'],
    ['consumer-spending', 'electronics',   0.45, 'demand'],
    ['consumer-spending', 'consumer-goods', 0.6, 'demand'],
    ['consumer-spending', 'real-estate',   0.3,  'demand'],
    ['employment',   'consumer-spending',  0.8,  'income-effect'],
    ['employment',   'banking',       0.2,  'demand'],
    ['employment',   'govt-revenue',  0.5,  'cross-market'],
    ['inflation',    'consumer-spending', 0.6, 'income-effect'],
    ['inflation',    'banking',       0.4,  'cross-market'],
    ['inflation',    'real-estate',   0.3,  'cross-market'],
    ['inflation',    'employment',    0.2,  'cross-market'],
    ['govt-revenue', 'healthcare',    0.3,  'demand'],
    ['govt-revenue', 'public-transit', 0.35, 'demand'],
    ['govt-revenue', 'employment',    0.2,  'income-effect'],
  ];

  edges.forEach(([from, to, weight, type]) => {
    g.addEdge(from, to, weight, type);
  });

  return g;
}


class EconomicEngine {
  constructor(graph) {
    this.graph = graph;
  }

  validateInputs(config) {
    if (!config || !config.origin || !this.graph.sectors.has(config.origin)) {
      return { valid: false, msg: 'Invalid origin sector. Please select a valid sector.' };
    }
    const magnitude = Number(config.magnitude);
    if (!Number.isFinite(magnitude) || magnitude < 0.1 || magnitude > 100) {
      return { valid: false, msg: 'Shock magnitude must be a finite number between 0.1 and 100.' };
    }
    if (!['increase', 'decrease'].includes(config.direction)) {
      return { valid: false, msg: 'Select whether the shock increases or decreases.' };
    }
    if (!['temporary', 'persistent'].includes(config.duration)) {
      return { valid: false, msg: 'Select a valid shock duration.' };
    }
    if (!Number.isFinite(Number(config.horizon)) || Number(config.horizon) <= 0) {
      return { valid: false, msg: 'Select a valid time horizon.' };
    }
    if (!['optimistic', 'base', 'adverse', 'custom'].includes(config.scenario)) {
      return { valid: false, msg: 'Select a valid scenario.' };
    }
    if (!['price-increase', 'cost-increase', 'demand-decline', 'interest-rate', 'tax-change', 'supply-disruption', 'exchange-rate'].includes(config.shockType)) {
      return { valid: false, msg: 'Select a supported shock type.' };
    }
    for (const key of ['elasticityMultiplier', 'passThroughMultiplier']) {
      if (config[key] !== undefined && (!Number.isFinite(Number(config[key])) || Number(config[key]) < 0)) {
        return { valid: false, msg: `${key} must be a non-negative finite number.` };
      }
    }
    return { valid: true };
  }

  runSimulation(config, skipExtras = false) {
    const validation = this.validateInputs(config);
    if (!validation.valid) return { error: validation.msg };

    const scenarioMult = this.getScenarioMultiplier(config.scenario);
    const effectiveMag = config.magnitude * scenarioMult * (config.direction === 'decrease' ? -1 : 1);
    const durationMult = config.duration === 'persistent' ? 1.0 : 0.6;
    const horizonMult = this.getHorizonMultiplier(config.horizon);

    // BFS propagation from origin
    const bfsOrder = this.graph.getBFSOrder(config.origin);
    const impacts = new Map();
    const maxRing = bfsOrder.length > 0 ? Math.max(...bfsOrder.map(n => n.ring)) : 0;

    // Calculate impacts for each sector in BFS order
    bfsOrder.forEach(node => {
      const sector = this.graph.sectors.get(node.id);
      if (!sector) return;

      let priceChange = 0;
      let demandChange = 0;
      let costChange = 0;
      let transmitter = node.parent;
      let mechanism = 'input-cost';

      if (node.ring === 0) {
        // ---- EPICENTRE: shock types use different economic channels. ----
        // These are transparent teaching heuristics, not empirically calibrated forecasts.
        const elastMult = Number.isFinite(Number(config.elasticityMultiplier)) ? Number(config.elasticityMultiplier) : 1;
        const passMult = Number.isFinite(Number(config.passThroughMultiplier)) ? Number(config.passThroughMultiplier) : 1;
        const supplyElasticity = Math.max(0.1, Math.min(0.8, Math.abs(sector.elasticitySupply || 0.3)));

        switch (config.shockType) {
          case 'price-increase':
            priceChange = effectiveMag;
            demandChange = effectiveMag * sector.elasticityDemand * elastMult;
            costChange = effectiveMag * 0.8;
            break;
          case 'cost-increase':
            costChange = effectiveMag;
            priceChange = effectiveMag * sector.passThrough * passMult;
            demandChange = priceChange * sector.elasticityDemand * elastMult;
            break;
          case 'demand-decline':
            // A signed demand shift moves equilibrium quantity and price in the same direction.
            demandChange = effectiveMag;
            priceChange = effectiveMag * supplyElasticity;
            costChange = effectiveMag * 0.1;
            break;
          case 'interest-rate':
            // Magnitude is in percentage points; model a financing-cost increase and demand response.
            costChange = effectiveMag * 0.5;
            demandChange = -effectiveMag * 0.8 * elastMult;
            priceChange = effectiveMag * 0.1;
            break;
          case 'tax-change':
            costChange = effectiveMag;
            priceChange = effectiveMag * sector.passThrough * passMult;
            demandChange = priceChange * sector.elasticityDemand * elastMult;
            break;
          case 'supply-disruption':
            // A more severe disruption raises prices/costs and reduces quantity demanded.
            priceChange = effectiveMag;
            costChange = effectiveMag * 0.7;
            demandChange = priceChange * sector.elasticityDemand * elastMult;
            break;
          case 'exchange-rate':
            // Positive change is treated as domestic-currency depreciation for import exposure.
            costChange = effectiveMag * sector.passThrough;
            priceChange = costChange * sector.passThrough * passMult;
            demandChange = priceChange * sector.elasticityDemand * elastMult;
            break;
          default:
            priceChange = effectiveMag;
            demandChange = effectiveMag * sector.elasticityDemand * elastMult;
            costChange = effectiveMag * 0.8;
        }
      } else {
        // ---- PROPAGATED IMPACT (Ring 1+) ----
        const incomingEdges = this.graph.getUpstream(node.id);
        let totalPriceImpact = 0;
        let totalDemandImpact = 0;
        let totalCostImpact = 0;
        let maxWeight = 0;

        for (let i = 0; i < incomingEdges.length; i++) {
          const edge = incomingEdges[i];
          const parentImpact = impacts.get(edge.from);
          if (!parentImpact) continue;

          const propPrice = parentImpact.priceChange * edge.weight * sector.passThrough;
          const propDemand = parentImpact.demandChange * edge.weight * 0.5;
          const propCost = parentImpact.costChange * edge.weight * sector.passThrough * 0.7;

          // Apply edge-type-specific propagation rules
          if (edge.type === 'input-cost') {
            totalCostImpact += propPrice * 0.8;
            totalPriceImpact += propPrice * sector.passThrough;
            totalDemandImpact += propPrice * sector.elasticityDemand * 0.5;
          } else if (edge.type === 'demand') {
            totalDemandImpact += propDemand * 1.2;
            totalPriceImpact += propDemand * 0.3;
            totalCostImpact += propDemand * 0.2;
          } else if (edge.type === 'substitution') {
            totalDemandImpact -= propPrice * 0.6;
            totalPriceImpact -= propPrice * 0.3;
          } else if (edge.type === 'competition') {
            totalDemandImpact -= propDemand * 0.5;
            totalPriceImpact -= propPrice * 0.2;
          } else if (edge.type === 'income-effect') {
            totalDemandImpact += propDemand * sector.incomeElasticity;
            totalPriceImpact += propDemand * 0.1;
          } else if (edge.type === 'cross-market') {
            totalPriceImpact += propPrice * 0.4;
            totalDemandImpact += propDemand * 0.3;
            totalCostImpact += propCost * 0.3;
          }

          // Track strongest transmitter
          if (Math.abs(edge.weight) > maxWeight && parentImpact) {
            maxWeight = Math.abs(edge.weight);
            transmitter = edge.from;
            mechanism = edge.type;
          }
        }

        // Apply custom multipliers
        const elastMult = Number.isFinite(Number(config.elasticityMultiplier)) ? Number(config.elasticityMultiplier) : 1;
        const passMult = Number.isFinite(Number(config.passThroughMultiplier)) ? Number(config.passThroughMultiplier) : 1;

        priceChange = totalPriceImpact * durationMult * horizonMult * passMult;
        demandChange = totalDemandImpact * durationMult * horizonMult * elastMult;
        costChange = totalCostImpact * durationMult * horizonMult * passMult;
      }

      // Clamp all values to ±80%
      priceChange = Math.max(-80, Math.min(80, priceChange));
      demandChange = Math.max(-80, Math.min(80, demandChange));
      costChange = Math.max(-80, Math.min(80, costChange));

      // ---- Financial calculations ----
      const baseRevenue = sector.basePrice * sector.baseDemand;
      const newPrice = sector.basePrice * (1 + priceChange / 100);
      const newDemand = sector.baseDemand * (1 + demandChange / 100);
      const newRevenue = newPrice * newDemand;
      const revenueChange = baseRevenue !== 0 ? ((newRevenue - baseRevenue) / baseRevenue) * 100 : 0;

      const baseCost = baseRevenue * 0.7;
      const newCost = baseCost * (1 + costChange / 100);
      const costChangePercent = costChange;

      const baseProfit = baseRevenue - baseCost;
      const newProfit = newRevenue - newCost;
      const profitChange = baseProfit !== 0 ? ((newProfit - baseProfit) / Math.abs(baseProfit)) * 100 : 0;

      const baseMargin = baseRevenue !== 0 ? (baseProfit / baseRevenue) * 100 : 0;
      const newMargin = newRevenue !== 0 ? (newProfit / newRevenue) * 100 : 0;
      const marginChange = newMargin - baseMargin;

      // ---- ERIS Score calculation ----
      const shockComponent = Math.min(Math.abs(effectiveMag) / 50, 1);
      const exposureComponent = node.ring === 0 ? 1 : Math.min(1, this.calculateExposure(node.id, config.origin));
      const elasticityComponent = Math.min(Math.abs(sector.elasticityDemand) / 2, 1);
      const propagationComponent = node.ring === 0 ? 1 : Math.max(0, 1 - (node.ring * 0.2));

      const eris = 100 * (
        0.25 * shockComponent +
        0.25 * exposureComponent +
        0.25 * elasticityComponent +
        0.25 * propagationComponent
      );

      // ---- Direction classification ----
      let impactDirection = 'neutral';
      if (priceChange > 0.5) {
        impactDirection = demandChange < -0.5 ? 'negative' : 'mixed';
      } else if (priceChange < -0.5) {
        impactDirection = demandChange > 0.5 ? 'positive' : 'mixed';
      } else if (Math.abs(priceChange) < 0.5 && Math.abs(demandChange) < 0.5) {
        impactDirection = 'neutral';
      } else {
        impactDirection = 'mixed';
      }

      // ---- Build impact object ----
      const impact = {
        sectorId: node.id,
        sectorName: sector.name,
        category: sector.category,
        ring: node.ring,
        parent: node.parent,
        priceChange: priceChange,
        demandChange: demandChange,
        costChange: costChangePercent,
        revenueChange: revenueChange,
        profitChange: profitChange,
        marginChange: marginChange,
        eris: Math.max(0, Math.min(100, eris)),
        erisComponents: {
          shock: shockComponent,
          exposure: exposureComponent,
          elasticity: elasticityComponent,
          propagation: propagationComponent
        },
        direction: impactDirection,
        baseRevenue: baseRevenue,
        newRevenue: newRevenue,
        baseCost: baseCost,
        newCost: newCost,
        baseProfit: baseProfit,
        newProfit: newProfit,
        baseMargin: baseMargin,
        newMargin: newMargin,
        transmitter: transmitter,
        mechanism: mechanism,
        explanation: '',
        risks: [],
        opportunities: []
      };

      // Generate explanation, risks, opportunities
      impact.explanation = this.getExplanation(sector, impact, config);
      impact.risks = this.getRisks(sector, impact);
      impact.opportunities = this.getOpportunities(sector, impact);

      impacts.set(node.id, impact);
    });

    // Fix transmitter and mechanism for non-epicenter nodes (second pass)
    bfsOrder.forEach(node => {
      if (node.ring > 0) {
        const imp = impacts.get(node.id);
        if (imp) {
          const incomingEdges = this.graph.getUpstream(node.id);
          let maxWeight = 0;
          for (let i = 0; i < incomingEdges.length; i++) {
            const edge = incomingEdges[i];
            if (impacts.has(edge.from) && edge.weight > maxWeight) {
              maxWeight = edge.weight;
              imp.transmitter = edge.from;
              imp.mechanism = edge.type;
            }
          }
        }
      }
    });

    // Keep scenario/sensitivity calculations on the same engine path as the main run.
    // The skipExtras flag prevents recursive scenario calculation.
    const scenarios = skipExtras ? {} : this.runAllScenarios(config);
    const sensitivity = skipExtras ? [] : this.sensitivityAnalysis(config);

    return {
      config: config,
      impacts: impacts,
      bfsOrder: bfsOrder,
      maxRing: maxRing,
      scenarios: scenarios,
      sensitivity: sensitivity,
      epicenter: config.origin,
      timestamp: Date.now()
    };
  }

  calculateExposure(sectorId, originId) {
    const path = this.graph.getShortestPathDijkstra(originId, sectorId);
    if (path.length <= 1) return 0;

    let exposure = 1;
    for (let i = 0; i < path.length - 1; i++) {
      const edges = this.graph.getNeighbors(path[i]);
      const edge = edges.find(e => e.to === path[i + 1]);
      if (edge) {
        exposure *= edge.weight;
      } else {
        exposure *= 0.1;
      }
    }
    return exposure;
  }

  getScenarioMultiplier(scenario) {
    switch (scenario) {
      case 'optimistic': return 0.5;
      case 'base':       return 1.0;
      case 'adverse':    return 1.5;
      case 'custom':     return 1.0;
      default:           return 1.0;
    }
  }

  getHorizonMultiplier(months) {
    if (months <= 3)  return 0.6;
    if (months <= 6)  return 0.8;
    if (months <= 12) return 1.0;
    return 1.2;
  }

  runAllScenarios(config) {
    const results = {};
    ['optimistic', 'base', 'adverse'].forEach(scenario => {
      const run = this.runSimulation({ ...config, scenario }, true);
      results[scenario] = run && !run.error ? run.impacts : new Map();
    });
    return results;
  }

  sensitivityAnalysis(config) {
    const baseResult = this.quickSimAvgImpact(config);
    const tests = [
      { name: 'Magnitude', low: { magnitude: Math.max(0.1, config.magnitude * 0.5) }, high: { magnitude: Math.min(100, config.magnitude * 1.5) } },
      { name: 'Pass-Through', low: { passThroughMultiplier: 0.5 }, high: { passThroughMultiplier: 1.5 } },
      { name: 'Elasticity', low: { elasticityMultiplier: 0.5 }, high: { elasticityMultiplier: 1.5 } },
      { name: 'Duration Effect', low: { duration: 'temporary' }, high: { duration: 'persistent' } },
      { name: 'Time Horizon', low: { horizon: 3 }, high: { horizon: 24 } }
    ];

    return tests.map(test => {
      const lowResult = this.quickSimAvgImpact({ ...config, ...test.low });
      const highResult = this.quickSimAvgImpact({ ...config, ...test.high });
      return {
        name: test.name,
        low: lowResult - baseResult,
        high: highResult - baseResult,
        base: baseResult
      };
    });
  }

  quickSimAvgImpact(config) {
    const run = this.runSimulation(config, true);
    if (!run || run.error || !run.impacts || run.impacts.size === 0) return 0;

    let total = 0;
    let count = 0;
    run.impacts.forEach(impact => {
      // Average absolute price, demand and cost changes. This is an illustrative
      // sensitivity metric, not a predicted GDP or welfare loss.
      total += (Math.abs(impact.priceChange) + Math.abs(impact.demandChange) + Math.abs(impact.costChange)) / 3;
      count++;
    });
    return count > 0 ? total / count : 0;
  }

  getExplanation(sector, impact, config) {
    const originSector = this.graph.sectors.get(config.origin);
    const originName = originSector ? originSector.name : config.origin;

    if (impact.ring === 0) {
      const units = config.shockType === 'interest-rate' ? ' pp' : '%';
      const channel = {
        'price-increase': 'a direct price change',
        'cost-increase': 'a production-cost change with pass-through to price',
        'demand-decline': 'a signed demand/income shift that moves equilibrium quantity and price in the same direction',
        'interest-rate': 'a financing-cost and demand response to an interest-rate change',
        'tax-change': 'a production-cost increase with price pass-through',
        'supply-disruption': 'a supply disruption that raises costs/prices and reduces quantity demanded',
        'exchange-rate': 'an exchange-rate move affecting exposed input costs and prices'
      }[config.shockType] || 'a direct shock';
      return `${sector.name} is the epicentre. The model applies ${Math.abs(config.magnitude).toFixed(1)}${units} as ${config.direction === 'decrease' ? 'a decrease' : 'an increase'} in the selected shock and represents it as ${channel}. The response is a simplified teaching scenario, not a calibrated forecast.`;
    }

    const transmitterName = impact.transmitter
      ? (this.graph.sectors.get(impact.transmitter)?.name || impact.transmitter)
      : 'upstream sector';

    const mechDesc = {
      'input-cost':    `through input cost transmission from ${transmitterName}. Higher costs in ${transmitterName} flow downstream as increased production costs`,
      'demand':        `through demand linkage from ${transmitterName}. Changes in ${transmitterName} alter the demand for ${sector.name}'s products`,
      'substitution':  `as a substitute for ${transmitterName}. When ${transmitterName} becomes more expensive, demand shifts toward ${sector.name}`,
      'competition':   `through competitive pressure from ${transmitterName}. Market dynamics between these sectors create offsetting effects`,
      'income-effect': `through income effects originating from ${transmitterName}. Changes in economic activity affect consumer purchasing power`,
      'cross-market':  `through cross-market spillover from ${transmitterName}. Interconnected market dynamics transmit the shock across sectors`
    };

    const mech = mechDesc[impact.mechanism] || `through economic linkage with ${transmitterName}`;

    return `${sector.name} is affected at Ring ${impact.ring} ${mech}. Price impact: ${impact.priceChange > 0 ? '+' : ''}${impact.priceChange.toFixed(2)}%, Demand impact: ${impact.demandChange > 0 ? '+' : ''}${impact.demandChange.toFixed(2)}%.`;
  }

  getRisks(sector, impact) {
    const risks = [];

    if (impact.priceChange > 2) {
      risks.push('Rising input costs may squeeze operating margins');
    }
    if (impact.demandChange < -2) {
      risks.push('Declining demand could reduce revenue and market share');
    }
    if (impact.profitChange < -5) {
      risks.push('Significant profit erosion expected — may require cost restructuring');
    }
    if (impact.marginChange < -2) {
      risks.push('Margin compression risk threatens long-term viability');
    }
    if (Math.abs(impact.priceChange) > 10) {
      risks.push('Price volatility may deter investment and planning');
    }
    if (impact.ring <= 1 && Math.abs(impact.priceChange) > 5) {
      risks.push('Direct exposure to shock epicenter amplifies vulnerability');
    }
    if (impact.costChange > 5) {
      risks.push('Cost inflation may require price adjustments or efficiency gains');
    }
    if (impact.costChange > 10 && impact.demandChange < -1) {
      risks.push('Simultaneous cost increase and demand decline creates a profit squeeze');
    }

    if (risks.length === 0) {
      risks.push('Minimal direct risk exposure — monitor for secondary effects');
    }

    return risks;
  }

  getOpportunities(sector, impact) {
    const opps = [];

    if (impact.priceChange < -2) {
      opps.push('Lower input costs could improve margins and competitiveness');
    }
    if (impact.demandChange > 2) {
      opps.push('Increased demand creates growth and expansion opportunity');
    }
    if (impact.direction === 'positive') {
      opps.push('Favorable market conditions support strategic expansion');
    }
    if (sector.category === 'Energy' && impact.priceChange > 5) {
      opps.push('Higher energy prices benefit producers and incentivize investment');
    }
    if (impact.mechanism === 'substitution') {
      opps.push('Substitution effect may redirect demand toward this sector');
    }
    if (Math.abs(impact.priceChange) < 1 && Math.abs(impact.demandChange) < 1) {
      opps.push('Relative stability provides competitive advantage over disrupted peers');
    }
    if (impact.profitChange > 5) {
      opps.push('Profit growth enables reinvestment and capacity expansion');
    }
    if (impact.marginChange > 1) {
      opps.push('Improving margins create room for strategic pricing or investment');
    }

    if (opps.length === 0) {
      opps.push('Monitor for emerging opportunities as market adjusts to new equilibrium');
    }

    return opps;
  }
}



// ---------------------- HTTP API layer ----------------------
const graph = buildEconomicGraph();
const engine = new EconomicEngine(graph);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.RIPPLERISK_API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE || 60);
const rateBuckets = new Map();

const SECTOR_ALIASES = {
  'semiconductor': 'electronics',
  'semiconductors': 'electronics',
  'semiconductor components': 'electronics',
  'chip': 'electronics',
  'chips': 'electronics',
  'computer chips': 'electronics',
  'electronic components': 'electronics',
  'consumer electronics': 'electronics',
  'wireless earbuds': 'electronics',
  'earbuds': 'electronics',
  'raw materials': 'steel',
  'raw material': 'steel',
  'steel and metals': 'steel',
  'steel & metals': 'steel',
  'oil': 'crude-oil',
  'crude oil': 'crude-oil',
  'natural gas': 'natural-gas',
  'electric power': 'electricity',
  'shipping': 'shipping',
  'logistics': 'shipping',
  'banking and finance': 'banking',
  'consumer spending': 'consumer-spending',
  'it services': 'it-services',
  'pharmaceuticals': 'pharma',
  'agriculture': 'farming',
  'food processing': 'food-proc',
  'e-commerce': 'ecommerce',
  'real estate': 'real-estate',
  'public transit': 'public-transit',
  'government revenue': 'govt-revenue',
};
const SHOCK_ALIASES = {
  'price increase': 'price-increase',
  'price rise': 'price-increase',
  'cost increase': 'cost-increase',
  'production cost increase': 'cost-increase',
  'raw material cost increase': 'cost-increase',
  'raw-material cost increase': 'cost-increase',
  'raw-material-cost-increase': 'cost-increase',
  'demand decline': 'demand-decline',
  'demand decrease': 'demand-decline',
  'interest rate': 'interest-rate',
  'interest rate change': 'interest-rate',
  'tax change': 'tax-change',
  'production tax': 'tax-change',
  'supply disruption': 'supply-disruption',
  'exchange rate': 'exchange-rate',
  'exchange rate change': 'exchange-rate',
};
const SUPPORTED_SHOCKS = new Set(['price-increase','cost-increase','demand-decline','interest-rate','tax-change','supply-disruption','exchange-rate']);

function normalizedText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
}
function resolveSector(rawValue) {
  const raw = String(rawValue ?? '').trim();
  const norm = normalizedText(raw);
  const slug = raw.toLowerCase().trim().replace(/[&]/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (graph.sectors.has(raw)) return { id: raw, requested: raw, mapped: false, note: null };
  if (graph.sectors.has(slug)) return { id: slug, requested: raw, mapped: false, note: null };
  const alias = SECTOR_ALIASES[norm];
  if (alias && graph.sectors.has(alias)) {
    const isProxy = ['semiconductor','semiconductors','semiconductor components','chip','chips','computer chips','electronic components','consumer electronics','wireless earbuds','earbuds'].includes(norm);
    return {
      id: alias, requested: raw, mapped: isProxy,
      note: isProxy ? 'The model has no dedicated semiconductor-components sector. The request was mapped to the existing Electronics sector as a proxy; interpret results accordingly.' : null
    };
  }
  for (const [id, sector] of graph.sectors.entries()) {
    if (normalizedText(sector.name) === norm) return { id, requested: raw, mapped: false, note: null };
  }
  return null;
}
function resolveShockType(rawValue) {
  const raw = String(rawValue ?? '').trim().toLowerCase();
  if (SUPPORTED_SHOCKS.has(raw)) return raw;
  const norm = normalizedText(raw);
  return SHOCK_ALIASES[norm] || null;
}
function finiteNumber(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ApiError(400, `${fieldName} must be a finite number.`);
  return n;
}
class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
function normaliseRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Request body must be a JSON object.');
  const shockType = resolveShockType(body.shock_type ?? body.shockType);
  if (!shockType) throw new ApiError(400, 'Unsupported or missing shock_type. Supported types: ' + [...SUPPORTED_SHOCKS].join(', '));
  const rawSector = body.origin_sector ?? body.origin ?? body.affected_sector ?? body.sector_id;
  const sector = resolveSector(rawSector);
  if (!sector) throw new ApiError(400, 'Missing or unknown origin_sector/affected_sector. Use GET /sectors to view valid sector IDs.');
  const magnitude = finiteNumber(body.shock_magnitude_percent ?? body.magnitude, undefined, 'shock_magnitude_percent');
  if (magnitude === undefined || magnitude < 0.1 || magnitude > 100) throw new ApiError(400, 'shock_magnitude_percent must be between 0.1 and 100.');
  const direction = String(body.direction || 'increase').toLowerCase();
  const duration = String(body.duration || 'temporary').toLowerCase();
  const horizon = finiteNumber(body.horizon_months ?? body.horizon, 6, 'horizon_months');
  const scenario = String(body.scenario || 'base').toLowerCase();
  const elasticityMultiplier = finiteNumber(body.elasticity_multiplier ?? body.elasticityMultiplier, 1, 'elasticity_multiplier');
  const passThroughMultiplier = finiteNumber(body.pass_through_multiplier ?? body.passThroughMultiplier, 1, 'pass_through_multiplier');
  const config = { shockType, origin: sector.id, magnitude, direction, duration, horizon, scenario, elasticityMultiplier, passThroughMultiplier };
  const validation = engine.validateInputs(config);
  if (!validation.valid) throw new ApiError(400, validation.msg);
  return {
    config,
    metadata: {
      shock_type: shockType,
      shock_magnitude_percent: magnitude,
      direction,
      origin_sector_requested: String(rawSector),
      origin_sector_used: sector.id,
      target_industry: String(body.target_industry ?? body.industry ?? '').trim() || null,
      business_context: String(body.business_context ?? '').trim() || null,
      model_sector_mapping_applied: sector.mapped,
      model_sector_mapping_note: sector.note,
    }
  };
}
function round(value, digits=3) {
  if (!Number.isFinite(Number(value))) return null;
  const f = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * f) / f;
}
function oneImpact(impact) {
  return {
    sector_id: impact.sectorId,
    sector_name: impact.sectorName,
    category: impact.category,
    ring: impact.ring,
    parent_sector_id: impact.parent || null,
    price_change_percent: round(impact.priceChange),
    demand_change_percent: round(impact.demandChange),
    cost_change_percent: round(impact.costChange),
    revenue_change_percent: round(impact.revenueChange),
    profit_change_percent: round(impact.profitChange),
    margin_change_percentage_points: round(impact.marginChange),
    eris_score: round(impact.eris, 2),
    direction: impact.direction,
    base_revenue_model_units: round(impact.baseRevenue, 2),
    new_revenue_model_units: round(impact.newRevenue, 2),
    base_cost_model_units: round(impact.baseCost, 2),
    new_cost_model_units: round(impact.newCost, 2),
    base_profit_model_units: round(impact.baseProfit, 2),
    new_profit_model_units: round(impact.newProfit, 2),
    base_margin_percent: round(impact.baseMargin, 2),
    new_margin_percent: round(impact.newMargin, 2),
    transmitter_sector_id: impact.transmitter || null,
    mechanism: impact.mechanism,
    explanation: impact.explanation,
    risks: impact.risks || [],
    opportunities: impact.opportunities || [],
  };
}
function summariseImpactMap(impactMap) {
  const impacts = [...impactMap.values()];
  if (!impacts.length) return { sectors_reached: 0, sectors_with_material_change: 0, max_ring: 0, average_eris_score: 0, average_absolute_impact_percent: 0, top_impacts: [] };
  const material = impacts.filter(i => Math.max(Math.abs(i.priceChange), Math.abs(i.demandChange), Math.abs(i.costChange)) >= 0.1);
  const absImpact = impacts.reduce((sum, i) => sum + (Math.abs(i.priceChange) + Math.abs(i.demandChange) + Math.abs(i.costChange)) / 3, 0) / impacts.length;
  const maxRing = Math.max(...impacts.map(i => i.ring || 0));
  const avgERIS = impacts.reduce((sum, i) => sum + i.eris, 0) / impacts.length;
  const top = [...impacts].sort((a, b) => Math.max(Math.abs(b.priceChange), Math.abs(b.demandChange), Math.abs(b.costChange)) - Math.max(Math.abs(a.priceChange), Math.abs(a.demandChange), Math.abs(a.costChange))).slice(0, 8).map(oneImpact);
  return {
    sectors_reached: impacts.length,
    sectors_with_material_change: material.length,
    max_ring: maxRing,
    average_eris_score: round(avgERIS, 2),
    average_absolute_impact_percent: round(absImpact, 3),
    top_impacts: top,
  };
}
function analyse(body, comparisonEndpoint=false) {
  const {config, metadata} = normaliseRequest(body);
  const result = engine.runSimulation(config);
  if (result.error) throw new ApiError(400, result.error);
  const allImpacts = [...result.impacts.values()];
  const impactsSorted = allImpacts.sort((a,b) => a.ring - b.ring || b.eris - a.eris);
  const epic = result.impacts.get(config.origin);
  const scenarioComparison = {};
  for (const name of ['optimistic','base','adverse']) {
    const m = result.scenarios?.[name];
    if (m instanceof Map) scenarioComparison[name] = summariseImpactMap(m);
  }
  const response = {
    success: true,
    tool: 'RippleRisk Economic Shock Analyzer API',
    model: {
      name: 'RippleRisk Economic Engine',
      source: 'EconomicGraph and EconomicEngine extracted from RippleRisk_Integrated_Corrected.html',
      status: 'Illustrative teaching/decision-support model; not empirically calibrated',
      model_version: 'html-engine-adapter-1.0.0'
    },
    request: metadata,
    configuration: {
      duration: config.duration,
      horizon_months: config.horizon,
      selected_scenario: config.scenario,
      elasticity_multiplier: config.elasticityMultiplier,
      pass_through_multiplier: config.passThroughMultiplier
    },
    summary: {
      ...summariseImpactMap(result.impacts),
      epicenter: epic ? oneImpact(epic) : null,
      maximum_propagation_ring: result.maxRing,
      timestamp_utc: new Date(result.timestamp).toISOString()
    },
    scenario_comparison: scenarioComparison,
    limitations: [
      'Outputs are generated by a simplified, illustrative heuristic model and are not empirical forecasts.',
      'The current engine assumes base costs equal 70% of modeled base revenue across sectors; this is a simplifying assumption.',
      'Sector elasticities, pass-through rates, and network link weights are hard-coded assumptions rather than live market data.',
      'Model revenue, cost, and profit values are in model units based on hard-coded base prices and demand, not company-specific monetary forecasts.',
      'The model contains no dedicated semiconductor-components node; semiconductor shocks are mapped to the existing Electronics sector when requested by that alias.',
      'The API does not include a product-specific wireless-earbud pricing model. Pricing strategy decisions need company unit economics, component cost share, and demand-response assumptions.'
    ],
    ...(comparisonEndpoint ? {} : { impacts: impactsSorted.map(oneImpact) })
  };
  response.scenario_comparison_metric_note = 'Scenario summaries compare average absolute modeled price, demand, and cost percentage changes across reachable sectors. They are directional scenario indicators, not probabilities or forecasts.';
  return response;
}
function jsonResponse(res, status, payload, origin='*') {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload, null, 2));
}
function getAllowedOrigin(req) {
  const requested = req.headers.origin || '*';
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  return ALLOWED_ORIGINS.includes(requested) ? requested : ALLOWED_ORIGINS[0] || 'null';
}
function checkRateLimit(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rateBuckets.get(ip);
  if (!entry || now >= entry.resetAt) entry = { count: 0, resetAt: now + 60000 };
  entry.count += 1;
  rateBuckets.set(ip, entry);
  if (rateBuckets.size > 2000) {
    for (const [key, value] of rateBuckets) if (now >= value.resetAt) rateBuckets.delete(key);
  }
  return entry.count <= RATE_LIMIT_PER_MINUTE;
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = ''; let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new ApiError(413, 'Request body too large; maximum is 64 KB.'));
        req.destroy();
        return;
      }
      data += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (!data.trim()) return reject(new ApiError(400, 'Request body must contain valid JSON.'));
      try { resolve(JSON.parse(data)); }
      catch { reject(new ApiError(400, 'Malformed JSON request body.')); }
    });
    req.on('error', reject);
  });
}
const server = http.createServer(async (req, res) => {
  const origin = getAllowedOrigin(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type, Authorization, X-API-Key'}); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return jsonResponse(res, 200, {success:true, service:'RippleRisk API', status:'ok', model_loaded:true, sectors:graph.sectors.size, timestamp_utc:new Date().toISOString()}, origin);
  if (req.method === 'GET' && url.pathname === '/') return jsonResponse(res, 200, {service:'RippleRisk Economic Shock Analyzer API', api_version:'1.0.0', endpoints:{health:'GET /health', sectors:'GET /sectors', analyze:'POST /analyze', compare_scenarios:'POST /compare-scenarios', openapi:'GET /openapi.json'}, note:'Illustrative model; not empirically calibrated.'}, origin);
  if (req.method === 'GET' && url.pathname === '/openapi.json') return jsonResponse(res, 200, require('./openapi.json'), origin);
  if (req.method === 'GET' && url.pathname === '/sectors') {
    const items = [...graph.sectors.values()].map(s => ({id:s.id, name:s.name, category:s.category})).sort((a,b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return jsonResponse(res, 200, {success:true, count:items.length, sectors:items, aliases:{semiconductors:'electronics (proxy; no dedicated semiconductor sector)', 'raw materials':'steel'}}, origin);
  }
  if (!['POST'].includes(req.method) || !['/analyze','/compare-scenarios'].includes(url.pathname)) return jsonResponse(res, 404, {success:false,error:'Endpoint not found.',available_endpoints:['GET /health','GET /sectors','POST /analyze','POST /compare-scenarios','GET /openapi.json']}, origin);
  if (!checkRateLimit(req)) return jsonResponse(res, 429, {success:false,error:'Rate limit exceeded. Please retry after the minute window.'}, origin);
  if (API_KEY) {
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    const supplied = bearer ? bearer[1] : (req.headers['x-api-key'] || '');
    const good = typeof supplied === 'string' && crypto.timingSafeEqual(Buffer.from(supplied.padEnd(API_KEY.length, '\0').slice(0, API_KEY.length)), Buffer.from(API_KEY));
    if (!good || supplied.length !== API_KEY.length) return jsonResponse(res, 401, {success:false,error:'Missing or invalid API key.'}, origin);
  }
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) return jsonResponse(res, 415, {success:false,error:'Content-Type must be application/json.'}, origin);
  try {
    const body = await readJson(req);
    const output = analyse(body, url.pathname === '/compare-scenarios');
    return jsonResponse(res, 200, output, origin);
  } catch (error) {
    if (error instanceof ApiError) return jsonResponse(res, error.status, {success:false,error:error.message,...(error.details ? {details:error.details}: {})}, origin);
    console.error('Unexpected API error:', error);
    return jsonResponse(res, 500, {success:false,error:'Internal server error. See service logs for details.'}, origin);
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`RippleRisk API listening on http://${HOST}:${PORT}`));
}
module.exports = { server, graph, engine, normaliseRequest, analyse };
