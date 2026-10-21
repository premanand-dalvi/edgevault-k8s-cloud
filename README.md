[enterprise_production_readme.md](https://github.com/user-attachments/files/33751832/enterprise_production_readme.md)
<div align="center">

# ⚡ EdgeVault: Zero-Trust Ephemeral Asset Engine

### *Cloud-Native Ephemeral Object Delivery & Phone-Indexed Secure Peer Channel*

[![Kubernetes](https://img.shields.io/badge/Orchestrator-Kubernetes%20v1.30-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![AWS EKS](https://img.shields.io/badge/Infrastructure-AWS%20EKS%20%7C%20EBS%20CSI-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)
[![Docker](https://img.shields.io/badge/Containers-Docker%20Multi--Stage-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Engine-Node.js%20Express-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/Storage-PostgreSQL%20StatefulSet-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

<p align="center">
  <a href="#-architectural-blueprint">System Architecture</a> •
  <a href="#-key-technical-innovations">Core Capabilities</a> •
  <a href="#-deep-dive-ephemeral-lifecycle">Lifecycle Workflow</a> •
  <a href="#-kubernetes-declarative-specifications">K8s Orchestration</a> •
  <a href="#-getting-started--local-replication">Setup Guide</a> •
  <a href="#-security--zero-trust-posture">Zero-Trust Posture</a>
</p>

---

</div>

## 🌐 The Problem & The Solution

| The Traditional Vulnerability | The EdgeVault Paradigm |
| :--- | :--- |
| **Permanent Digital Footprints:** Cloud drives store assets indefinitely, increasing attack surface through stale access tokens and unrevoked links. | **Deterministic Ephemerality:** Assets self-destruct based on strict atomic counters (single download limit) or wall-clock TTLs (1 min to 24 hours). |
| **Public Link Indexation:** Shared file links can be crawled, leaked, or intercepted across intermediate proxies. | **Zero-Knowledge Addressing:** Dynamic hash URLs (`#/v/<uuid>`) verified against in-memory cryptographic hashes before raw byte transmission. |
| **Stateless Cloud Databases:** Database restarts wipe temporary files or cause split-brain data corruption. | **StatefulSet & EBS CSI:** Kubernetes-managed volumes bind dynamically to AWS EBS `gp3` storage, retaining data across pod lifecycles. |

---

## 📌 Architectural Blueprint

EdgeVault runs as a distributed multi-tier microservices application inside an isolated Kubernetes namespace (`edgevault`), routed via Layer-7 Ingress-NGINX and shielded with granular NetworkPolicies.

```
                                 [ Incoming Traffic / Internet ]
                                                │
                                    (NodePort 32365 / Ingress)
                                                ▼
                        ┌───────────────────────────────────────────────┐
                        │        Ingress-NGINX Reverse Proxy           │
                        │    - Proxy Buffer Size: 50MB (Base64)         │
                        │    - Timeout: 600s | SSL Offloading           │
                        └───────┬───────────────────────────────┬───────┘
                                │                               │
                     Prefix: /  │                               │ Prefix: /api
                                ▼                               ▼
            ┌───────────────────────────────┐   ┌───────────────────────────────┐
            │   frontend-service (Port 80)  │   │  backend-service (Port 5000)  │
            │   - React 18 / Vite Engine    │   │  - Node.js / Express Core     │
            │   - Glassmorphic Cyberpunk UI │   │  - JWT Auth & Cryptographic   │
            │   - Web Crypto Client Engine  │   │  - Auto-Destruct Sweeper      │
            └───────────────────────────────┘   └───────────────┬───────────────┘
                                                                │
                                            Internal Headless   │ TCP 5432
                                            Service Binding     │ NetworkPolicy Guard
                                                                ▼
                                                ┌───────────────────────────────┐
                                                │   postgres-db-0 (StatefulSet) │
                                                │   - Volume: 10Gi gp3 (AWS CSI)│
                                                │   - Atomic DELETE Operations  │
                                                └───────────────────────────────┘
```

---

## ✨ Key Technical Innovations

### 1. ⚡ Strict Burn-on-Read Mechanics
Every asset registered generates a cryptographically random 8-byte hexadecimal UUID. Download allowances decrement atomically. Once `downloads_done >= max_downloads` or `NOW() > expires_at`, an irreversible SQL `DELETE` query triggers, purging both the metadata and the base64 payload from persistent storage.

### 2. 🔐 Two-Layer Passphrase Cryptography
Files are encrypted and decoded without relying solely on storage-layer protection. Payloads can be sealed with a client-selected secret passphrase, hashed server-side using **SHA-256 with dynamic salt verification**.

### 3. 💬 Phone-Indexed Authenticated Workspace
A secure, real-time messaging pipeline indexed by verified phone numbers. Authenticated peers (backed by **JWT** & **Bcrypt** credentials) can connect peer-to-peer to dispatch ephemeral links, sensitive credentials, or files directly into one-to-one channels.

### 4. 🛡️ Resilient Cross-Browser Link Transport
Modern web standards block `navigator.clipboard` on HTTP IP addresses. EdgeVault incorporates an enterprise-grade clipboard fallback engine combining `document.execCommand('copy')` with hidden DOM buffers, guaranteeing seamless one-click link distribution on any device.

---

## 🔄 Deep Dive: Ephemeral Lifecycle

```
[ Client Action ]
   │
   ├─► Selects File & Configures Constraints (TTL: 1min | Max Downloads: 1)
   ├─► Optional SHA-256 Access Passphrase Attached
   │
[ Ingestion & Orchestration ]
   │
   ├─► Client FileReader converts payload to Base64
   ├─► Ingress-NGINX streams payload (50MB streaming buffer prevents HTTP 413)
   ├─► Express API binds UUID & writes to PostgreSQL via AWS EBS CSI (gp3)
   │
[ Delivery & Liquidation ]
   │
   ├─► Recipient opens non-indexable Hash Route (#/v/<uuid>)
   ├─► Passphrase validated against stored cryptographic checksum
   ├─► Payload downloaded as original file binary
   └─► Database executes ATOMIC PURGE: Asset completely destroyed.
```

---

## 🛠️ Tech Stack & Systems Engineering

* **Infrastructure & Cloud:** Amazon Web Services (AWS EKS, EC2, EBS gp3, ECR)
* **Orchestration:** Kubernetes (StatefulSets, Headless Services, Deployments, NetworkPolicies, Ingress-NGINX)
* **Frontend:** React 18, Vite, CSS Grid/Flexbox, System UI Theme
* **Backend:** Node.js, Express.js, JWT, Bcrypt.js, Crypto API
* **Database:** PostgreSQL 15 Alpine (with Dynamic PVC Binding via `ebs.csi.aws.com`)
* **Container Tooling:** Docker Multi-Stage Builds, Alpine Linux

---

## 📂 Repository Anatomy

```tree
edgevault-k8s-cloud/
├── backend/
│   ├── Dockerfile                 # Multi-stage lightweight Node Alpine container
│   ├── package.json               # Backend dependencies (express, pg, bcryptjs, jwt)
│   └── server.js                  # REST API, auth controller & auto-destruct sweeps
├── frontend/
│   ├── Dockerfile                 # Multi-stage Node builder + Nginx production runtime
│   ├── index.html                 # Single-page application entry point
│   ├── package.json               # React 18 & Vite configuration
│   ├── vercel.json                # Serverless rewrite proxy configuration
│   └── src/
│       ├── App.jsx                # Unified workspace: Vault generation, recipient unlock & chat
│       └── main.jsx               # React DOM bootstrap
├── k8s/
│   ├── 01-namespace.yaml          # Isolated cluster namespace definition
│   ├── 02-storage-ebs.yaml        # StorageClass (gp3) & PersistentVolumeClaims
│   ├── 03-postgres-statefulset.yaml # StatefulSet & headless service for PostgreSQL
│   ├── 04-deployments-services.yaml # Frontend & backend scalable deployments
│   └── 05-ingress-and-security.yaml # Ingress-NGINX rules & Postgres NetworkPolicies
└── README.md
```

---

## 🚀 Kubernetes Declarative Specifications

### 1. Provision Cluster Architecture
Clone this repository and apply the manifests in sequential order:

```bash
# 1. Create Isolated Namespace
kubectl apply -f k8s/01-namespace.yaml

# 2. Bind Persistent Storage Engine
kubectl apply -f k8s/02-storage-ebs.yaml

# 3. Deploy Stateful Database Tier
kubectl apply -f k8s/03-postgres-statefulset.yaml

# 4. Rollout Core Application Deployments
kubectl apply -f k8s/04-deployments-services.yaml

# 5. Establish Ingress Routing & Zero-Trust Policies
kubectl apply -f k8s/05-ingress-and-security.yaml
```

### 2. Verify Workload Health
```bash
kubectl get all,pvc,ingress -n edgevault
```

*Expected output:* All pods (`frontend`, `backend`, `postgres-db-0`) reporting `Running` with stateful volumes bound in `Bound` status.

---

## 🔒 Security & Zero-Trust Posture

1. **Pod-to-Pod Ingress Isolation:** A declarative `NetworkPolicy` locks down PostgreSQL port `5432`. Direct access is rejected for all pods across the cluster except pods carrying the label `app: edgevault-backend`.
2. **Buffer Overflow Safeguards:** Ingress request sizing is capped explicitly at `50MB` to eliminate Denial-of-Service (DoS) buffer exhaustion attempts.
3. **Stateless Frontend Footprint:** The frontend is served via an unprivileged `nginx:alpine` instance containing no sensitive credentials or database access tokens.

---

## 👨‍💻 Developer & Project Details

* **Author:** Premanand Dalvi
* **Domain:** Cloud Infrastructure, DevOps & Container Security
* **Target:** Production Cloud Deployments & Academic Project Submission

<div align="center">
  <sub>Built with precision on AWS EKS & Kubernetes. Open-sourced under the MIT License.</sub>
</div>
