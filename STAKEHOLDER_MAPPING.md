# Stakeholder Mapping

This document maps the personas who interact with RVoice, their goals, the questions they need answered, and how RVoice serves them.

## Personas

| Persona | Primary Goal | Key Questions | RVoice Features Used | Value Delivered |
|---------|-------------|---------------|---------------------|-----------------|
| **CX Team** (Customer Experience Manager) | Improve overall customer satisfaction and reduce churn | What are the top pain points? Which themes are trending up? What should we fix first? | AI Insights, Theme Clustering, Spike Detection, Action Recommendations | Prioritized, data-driven roadmap for CX improvements |
| **Store Manager** | Resolve local issues quickly and improve store-level NPS | What are customers saying about my store? What issues are emerging locally? | Store-filtered Themes, Spike Detection, Actions | Localized visibility into store performance and quick issue resolution |
| **Support Team** (Customer Support Lead) | Reduce ticket volume and resolve recurring issues faster | Which issues generate the most tickets? Are there new recurring problems? | Theme Clustering, Spike Detection, Chat Assistant | Early warning on emerging issues and reduced repeat contacts |
| **Product Owner** | Build features that customers actually want | What features are most requested? Which gaps are most urgent? | AI Insights, Theme Clustering, Prioritization | Evidence-based product backlog prioritization |
| **Operations Team** (Ops Manager) | Ensure smooth operations and minimize service disruptions | Are there operational failures (delivery, billing, app crashes)? | Spike Detection, Action Recommendations | Rapid detection and escalation of operational issues |

## Role-to-Feature Matrix

| Feature | CX Team | Store Manager | Support Team | Product Owner | Operations Team |
|---------|:-------:|:------------:|:------------:|:-------------:|:---------------:|
| AI Insights (prioritized recommendations) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Theme Clustering | ✅ | ✅ | ✅ | ✅ | — |
| Spike Detection | ✅ | ✅ | ✅ | — | ✅ |
| Action Recommendations | ✅ | ✅ | ✅ | — | ✅ |
| Chat Assistant | ✅ | ✅ | ✅ | ✅ | ✅ |
| Feedback Ingestion | — | — | ✅ | — | — |
| PII Masking (privacy) | ✅ | — | ✅ | — | — |

## Role-Based Access

| Role | Capabilities |
|------|-------------|
| `admin` | Full access — all features, user management, configuration |
| `manager` | Action creation and updates, view all insights |
| `analyst` | Theme estimation, AI insights, clustering, detection |
| `ingest` | Feedback and ingestion operations |
| `viewer` | Read-only access to dashboard and insights |

## Stakeholder Value Proposition

- **CX Team**: "RVoice turns scattered customer feedback into a prioritized action plan, so we fix what matters most first."
- **Store Manager**: "I see exactly what my customers are saying and what to do about it — without waiting for a monthly report."
- **Support Team**: "We catch emerging issues early and reduce repeat contacts by resolving root causes."
- **Product Owner**: "I build what customers actually ask for, backed by evidence from real feedback."
- **Operations Team**: "We detect operational failures fast and escalate before they become widespread."