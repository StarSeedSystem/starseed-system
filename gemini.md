# 🌌 Project Constitution (gemini.md)

This document is the single source of truth for the **StarSeed Network** project. It defines the Data Schemas, Behavioral Rules, and Architectural Invariants.

## 1. Discovery (Pending Input)

> [!IMPORTANT]
> The following sections must be defined before any coding begins.

- **North Star**: Build the digital incarnation of the **StarSeed Society**: a living, self-organized social network for ontocratic governance, universal education, and flourishing culture. A modular, interconnected system where the interface facilitates systemic understanding through "Cyberdelic" visualization.
- **Integrations**: 
    - **Frontend**: Next.js (React), WebGL / Three.js (for 3D visualizations: Network, Map, Avatars).
    - **Backend/DB**: Realtime Database (Supabase/Firebase) for instant synchronization (Crucial for "Atomic Post" concept).
    - **AI**: LLM Integration for the "Exocortex" Agent.
- **Source of Truth**: The **Realtime Database** is the single source of truth. All posts are "Atomic Entities" referenced, not copied.
- **Delivery Payload**: A robust, full-stack web application with a premium, smooth, "biological & technological" UI (Glassmorphism, Liquid Crystal).
- **Behavioral Rules**:
    - **Philosophy**: Ontocratic (Merit-based), Transhumanist (AI augmented), Communist (Open/Free Resources).
    - **Aesthetics**: "Interface Alive" - micro-animations, breathing elements, morphing transitions.
    - **Code Logic**: Deterministic business logic. "Data-First".

## 2. Data Schema

*To be defined after Discovery.*

```json
{
  "Account": {
    "id": "uuid",
    "email": "string",
    "is_verified": "boolean",
    "profiles": "Profile[]" 
  },
  "Profile": {
    "id": "uuid",
    "account_id": "uuid",
    "type": "enum(OFFICIAL, ARTISTIC, ANONYMOUS)",
    "handle": "string",
    "display_name": "string",
    "avatar_url": "string",
    "badges": "Badge[]",
    "stats": {
      "reputation": "number",
      "contributions": "number"
    }
  },
  "Page": {
    "id": "uuid",
    "type": "enum(COMMUNITY, ENTITY_FEDERATIVE, PARTY, PLACE, GROUP)",
    "title": "string",
    "members": "Profile[]",
    "governance": "GovernanceConfig",
    "tabs": "TabConfig[]" // Customizable tabs
  },
  "Post": {
    "id": "uuid",
    "author_id": "uuid (Profile)",
    "type": "enum(TEXT, GALLERY, CANVAS, EVENT, PROPOSAL)",
    "content": {
      "text": "string",
      "media": "Media[]",
      "canvas_data": "json", // For Universal Canvas
      "event_details": "EventDetails"
    },
    "visibility": "enum(PUBLIC, PRIVATE, SEGMENTED)",
    "references": [
      // Where is this post "shared" or displayed?
      { "context_id": "uuid (Page/Profile)", "context_type": "string" }
    ],
    "interactions": {
      "likes": "number",
      "comments_count": "number"
    },
    "created_at": "timestamp",
    "updated_at": "timestamp"
  },
  "StoreItem": {
     "id": "uuid",
     "seller_id": "uuid (Profile)",
     "title": "string",
     "description": "string",
     "price": { "amount": "number", "currency": "enum(SEEDS, KARMA)" },
     "type": "enum(BLUEPRINT, ASSET_3D, SERVICE, DATASET)",
     "preview_url": "string",
     "ipfs_hash": "string"
  },
  "LibraryItem": {
     "id": "uuid",
     "owner_id": "uuid (Profile)",
     "name": "string",
     "size": "string",
     "type": "enum(IMAGE, VIDEO, DOCUMENT, FOLDER, AUDIO)",
     "ipfs_cid": "string",
     "preview_url": "string",
     "tags": "string[]"
  }
}
```
**Status**: Implemented in Supabase (Project: StarSeed Network V2).

## 3. Architectural Invariants

- **Protocol**: B.L.A.S.T. (Blueprint, Link, Architect, Stylize, Trigger)
- **Architecture**: A.N.T. 3-Layer System (Abstract, Neural, Tangible)
- **Priorities**: Reliability > Speed. No guessing.
