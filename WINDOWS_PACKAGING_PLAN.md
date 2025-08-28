# Windows Packaging Implementation Plan
## SIP/PRI Migration Tool - Desktop Application Strategy

**Date**: August 27, 2025  
**Status**: Planning Phase  
**Target Platform**: Windows 10/11 (x64)

---

## Executive Summary

After extensive research of current packaging solutions, **Tauri v2** emerges as the optimal choice for converting our Next.js SIP/PRI Migration Tool into a secure, standalone Windows desktop application. This document outlines the implementation strategy, security considerations, and deployment plan.

## Why Tauri v2?

### Key Advantages
- **Bundle Size**: ~10-15MB (vs 100MB+ for Electron)
- **Security**: Industry-leading capability-based permission system
- **Performance**: Native system webview, no bundled Chromium
- **Distribution**: Single .exe or .msi installer with code signing
- **Maintenance**: Active development, strong community, corporate backing
- **Next.js Support**: Official documentation and examples available

### Comparison Matrix

| Feature | Tauri v2 | Electron | Wails | Neutralino | pkg/nexe |
|---------|----------|----------|-------|------------|----------|
| Bundle Size | 10-15MB | 100MB+ | 15-20MB | 2MB | 25MB+ |
| Security | Excellent | Good | Good | Good | Poor |
| Credential Protection | ✅ Built-in | ⚠️ Manual | ⚠️ Manual | ✅ Token-based | ❌ Limited |
| Next.js Support | ✅ Official | ✅ Native | ⚠️ Partial | ⚠️ Partial | ❌ Issues |
| Windows Integration | ✅ Full | ✅ Full | ✅ Full | ⚠️ Basic | ❌ None |
| Code Signing | ✅ Built-in | ✅ Manual | ✅ Manual | ⚠️ Manual | ❌ None |
| Active Development | ✅ Very | ✅ Very | ✅ Active | ✅ Active | ⚠️ Limited |

## Security Architecture

### Current Vulnerabilities
Our current setup has database credentials in plain `.env` file:
```
DB_HOST=metaswitch.grid4.com
DB_USER=shadowdb_reader
DB_PASSWORD=[REDACTED]
```

### Proposed Secure Architecture

#### Layer 1: Credential Storage
```rust
// Tauri backend (Rust)
use windows::Security::Credentials::PasswordVault;

#[tauri::command]
async fn get_db_config(app: AppHandle) -> Result<DbConfig, String> {
    // Option 1: Windows Credential Manager
    let vault = PasswordVault::new()?;
    let credential = vault.retrieve("Grid4_SIPTool", "ShadowDB")?;
    
    // Option 2: Encrypted config file
    let config_path = app.path_resolver()
        .app_config_dir()
        .unwrap()
        .join("config.enc");
    
    // Decrypt using Windows DPAPI
    let config = decrypt_with_dpapi(config_path)?;
    
    Ok(config)
}
```

#### Layer 2: Runtime Protection
- Database operations happen in Rust backend, not exposed to frontend
- IPC commands use capability-based permissions
- No credentials ever sent to renderer process

#### Layer 3: Distribution Security
- Code sign the executable with EV certificate
- Enable Windows SmartScreen immediately
- Encrypt sensitive strings in binary

## Implementation Plan

### Phase 1: Project Setup (Week 1)
```bash
# 1. Install Rust and Tauri CLI
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install tauri-cli

# 2. Initialize Tauri in existing Next.js project
cd "SIP PRI Migration Tool-ClaudeCode"
cargo tauri init

# 3. Configure for Next.js
# Update tauri.conf.json:
{
  "build": {
    "beforeBuildCommand": "pnpm build",
    "beforeDevCommand": "pnpm dev",
    "devPath": "http://localhost:3010",
    "distDir": "../out"
  }
}
```

### Phase 2: Backend Migration (Week 2)

#### Move Database Logic to Rust
```rust
// src-tauri/src/database.rs
use sqlx::postgres::PgPoolOptions;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct PbxLine {
    pub directorynumber: String,
    pub configuredsipbinding: String,
}

#[tauri::command]
pub async fn get_pbx_lines(binding: String) -> Result<Vec<PbxLine>, String> {
    let pool = get_secure_db_connection().await?;
    
    let lines = sqlx::query_as!(
        PbxLine,
        r#"
        SELECT directorynumber, configuredsipbinding
        FROM meta_pbx_line
        WHERE LOWER(configuredsipbinding) = LOWER($1)
        "#,
        binding
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(lines)
}

#[tauri::command]
pub async fn get_did_ranges(dns: Vec<String>) -> Result<Vec<DidRange>, String> {
    // Implement the complex DID range query logic here
    // This keeps the sensitive query logic in compiled Rust code
}
```

#### Frontend API Adapter
```typescript
// src/lib/tauri-db.ts
import { invoke } from '@tauri-apps/api/tauri'

export async function getDirectoryNumbersForBinding(binding: string): Promise<string[]> {
  if (window.__TAURI__) {
    const lines = await invoke<PbxLine[]>('get_pbx_lines', { binding })
    return lines.map(l => l.directorynumber)
  } else {
    // Fallback to Node.js API during development
    return fetch(`/api/pbx-lines?binding=${binding}`).then(r => r.json())
  }
}
```

### Phase 3: Security Hardening (Week 3)

#### Implement Credential Management
```rust
// src-tauri/src/security.rs
use aes_gcm::{Aes256Gcm, Key, Nonce};
use windows::Security::Cryptography::DataProtection::*;

pub struct SecureConfig {
    encrypted_data: Vec<u8>,
    nonce: Vec<u8>,
}

impl SecureConfig {
    pub fn load() -> Result<DatabaseConfig, Error> {
        // 1. Read encrypted config from %APPDATA%/Grid4/SIPTool/
        // 2. Decrypt using Windows DPAPI
        // 3. Return config or prompt user for credentials
    }
    
    pub fn save(config: &DatabaseConfig) -> Result<(), Error> {
        // 1. Encrypt with DPAPI (user-specific)
        // 2. Save to protected location
    }
}
```

#### Add Capability Restrictions
```json
// tauri.conf.json
{
  "tauri": {
    "allowlist": {
      "all": false,
      "fs": {
        "all": false,
        "readFile": true,
        "writeFile": true,
        "scope": ["$APPDATA/Grid4/**"]
      },
      "path": {
        "all": true
      },
      "protocol": {
        "all": false,
        "asset": true
      }
    }
  }
}
```

### Phase 4: Build & Distribution (Week 4)

#### Windows Code Signing
```powershell
# 1. Obtain EV Code Signing Certificate from DigiCert/Sectigo
# 2. Configure Tauri for signing
{
  "tauri": {
    "bundle": {
      "windows": {
        "certificateThumbprint": "[THUMBPRINT]",
        "timestampUrl": "http://timestamp.digicert.com"
      }
    }
  }
}
```

#### Build Process
```bash
# Development build
cargo tauri dev

# Production build (signed)
cargo tauri build

# Output:
# - target/release/sip-pri-tool.exe (standalone ~12MB)
# - target/release/bundle/msi/SIP_PRI_Tool_1.0.0_x64.msi (installer)
```

#### Distribution Options
1. **MSI Installer** (Recommended)
   - Professional appearance
   - Start menu integration
   - Uninstall support
   - Group Policy deployment ready

2. **Portable EXE**
   - Single file
   - No installation required
   - USB drive compatible

## Resource Protection Strategy

### Embedded Assets Security
```rust
// Encrypt sensitive assets at build time
const ENCRYPTED_LOGO: &[u8] = include_bytes!("../assets/logo.enc");
const ENCRYPTED_TEMPLATES: &[u8] = include_bytes!("../assets/templates.enc");

fn decrypt_asset(encrypted: &[u8]) -> Vec<u8> {
    // Decrypt at runtime using embedded key
}
```

### Anti-Tampering Measures
1. Binary packing with UPX (optional, adds 2MB)
2. String obfuscation for sensitive constants
3. Runtime integrity checks
4. Certificate pinning for API calls

## Testing Strategy

### Security Testing
- [ ] Attempt credential extraction with common tools
- [ ] Memory dump analysis
- [ ] Binary reverse engineering attempts
- [ ] Network traffic inspection
- [ ] File system monitoring

### Deployment Testing
- [ ] Clean Windows 10 machine (no dev tools)
- [ ] Windows 11 compatibility
- [ ] Non-admin user installation
- [ ] Group Policy deployment
- [ ] Antivirus compatibility (Windows Defender, etc.)

## Maintenance Plan

### Update Mechanism
```rust
#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<UpdateInfo, String> {
    let updater = app.updater();
    updater.check().await.map_err(|e| e.to_string())
}
```

### Telemetry (Optional)
- Error reporting to internal servers only
- No user data collection
- Opt-in crash reports

## Timeline & Milestones

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 1 | Project Setup | Tauri integrated with Next.js |
| 2 | Backend Migration | Database operations in Rust |
| 3 | Security Implementation | Encrypted credential storage |
| 4 | Build & Sign | Signed MSI installer |
| 5 | Testing & QA | Deployment ready |

## Risk Mitigation

### Technical Risks
1. **Risk**: Next.js SSR incompatibility
   - **Mitigation**: Use static export (`next export`)

2. **Risk**: Database driver compatibility
   - **Mitigation**: Use sqlx with static query checking

3. **Risk**: Windows Defender false positives
   - **Mitigation**: EV code signing, submit to Microsoft

### Security Risks
1. **Risk**: Credential extraction
   - **Mitigation**: Never store in binary, use OS keychain

2. **Risk**: Man-in-the-middle attacks
   - **Mitigation**: Certificate pinning, local-only connections

## Cost Analysis

### One-Time Costs
- EV Code Signing Certificate: $400-600/year
- Windows Developer Account: $19 (individual) or $99 (company)

### Ongoing Costs
- Certificate renewal: $400-600/year
- No runtime licensing fees (Tauri is open source)

## Conclusion

Tauri v2 provides the optimal balance of security, performance, and distribution simplicity for converting our Next.js SIP/PRI Migration Tool into a Windows desktop application. The ~10MB bundle size, built-in security features, and professional distribution options make it ideal for internal enterprise deployment.

### Next Steps
1. Get approval for EV code signing certificate
2. Set up Rust development environment
3. Begin Phase 1 implementation
4. Schedule security review for Week 3

### Success Criteria
- [ ] Single installer file under 20MB
- [ ] No extractable database credentials
- [ ] Works on standard Windows 10/11 without admin rights
- [ ] No security warnings during installation
- [ ] Maintains all current functionality

---

**Document Version**: 1.0  
**Last Updated**: August 27, 2025  
**Author**: Development Team  
**Status**: Awaiting Approval