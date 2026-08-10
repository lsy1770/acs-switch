use super::provider::build_provider_from_request;
use super::{import_provider_from_deeplink, DeepLinkImportRequest};
use crate::error::AppError;
use crate::store::AppState;
use crate::AppType;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::time::Duration;

const ACS_GATEWAY_ORIGIN: &str = "https://acsgw.top";
const ACS_PROFILE_EXCHANGE_URL: &str = "https://acsgw.top/api/v1/client-provision/exchange";

#[derive(Debug, Deserialize)]
struct GatewayResponse<T> {
    code: u16,
    message: String,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct AcsProvisionProfile {
    version: u8,
    gateway_origin: String,
    name: String,
    api_key: String,
    #[allow(dead_code)]
    api_key_id: u64,
    #[allow(dead_code)]
    allowed_models: Vec<String>,
    #[allow(dead_code)]
    provider_group_bindings: Vec<AcsProvisionBinding>,
    harnesses: Vec<AcsProvisionHarness>,
    expires_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct AcsProvisionBinding {
    #[allow(dead_code)]
    account_type: String,
    #[allow(dead_code)]
    group_id: u64,
    #[allow(dead_code)]
    group_name: String,
}

#[derive(Debug, Deserialize)]
struct AcsProvisionHarness {
    app: String,
    base_url: String,
    model: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcsProfileImportResult {
    pub profile_name: String,
    pub imported_ids: Vec<String>,
    pub apps: Vec<String>,
}

pub async fn import_acs_profile_from_deeplink(
    state: &AppState,
    request: DeepLinkImportRequest,
) -> Result<AcsProfileImportResult, AppError> {
    if request.resource != "acs-profile" {
        return Err(AppError::InvalidInput(format!(
            "Expected acs-profile resource, got '{}'",
            request.resource
        )));
    }

    let token = request
        .provision_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::InvalidInput("Missing ACS provisioning token".to_string()))?;

    let profile = exchange_profile(token).await?;
    let provider_requests = validate_and_build_provider_requests(&profile)?;

    let mut imported_ids = Vec::with_capacity(provider_requests.len());
    let mut apps = Vec::with_capacity(provider_requests.len());
    for provider_request in provider_requests {
        apps.push(provider_request.app.clone().unwrap_or_default());
        imported_ids.push(import_provider_from_deeplink(state, provider_request)?);
    }

    Ok(AcsProfileImportResult {
        profile_name: profile.name,
        imported_ids,
        apps,
    })
}

async fn exchange_profile(token: &str) -> Result<AcsProvisionProfile, AppError> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .https_only(true)
        .build()
        .map_err(|err| AppError::Message(format!("Failed to create ACS Gateway client: {err}")))?;

    let response = client
        .post(ACS_PROFILE_EXCHANGE_URL)
        .json(&serde_json::json!({ "token": token }))
        .send()
        .await
        .map_err(|err| AppError::Message(format!("Failed to reach ACS Gateway: {err}")))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| AppError::Message(format!("Failed to read ACS Gateway response: {err}")))?;
    let envelope: GatewayResponse<AcsProvisionProfile> =
        serde_json::from_str(&body).map_err(|_| {
            AppError::Message("ACS Gateway returned an invalid profile response".to_string())
        })?;

    if !status.is_success() || envelope.code != 200 {
        return Err(AppError::Message(if envelope.message.trim().is_empty() {
            format!("ACS Gateway rejected the provisioning token ({status})")
        } else {
            envelope.message
        }));
    }

    envelope
        .data
        .ok_or_else(|| AppError::Message("ACS Gateway returned an empty profile".to_string()))
}

fn validate_and_build_provider_requests(
    profile: &AcsProvisionProfile,
) -> Result<Vec<DeepLinkImportRequest>, AppError> {
    if profile.version != 1 || profile.gateway_origin != ACS_GATEWAY_ORIGIN {
        return Err(AppError::InvalidInput(
            "ACS profile origin or version is invalid".to_string(),
        ));
    }
    if Utc::now() >= profile.expires_at {
        return Err(AppError::InvalidInput(
            "ACS profile has expired".to_string(),
        ));
    }
    if !profile.api_key.starts_with("acs_") || profile.api_key.len() > 128 {
        return Err(AppError::InvalidInput(
            "ACS profile contains an invalid API key".to_string(),
        ));
    }
    if profile.name.trim().is_empty() || profile.name.len() > 100 {
        return Err(AppError::InvalidInput(
            "ACS profile name is invalid".to_string(),
        ));
    }
    if profile.harnesses.is_empty() || profile.harnesses.len() > 7 {
        return Err(AppError::InvalidInput(
            "ACS profile contains no supported harnesses".to_string(),
        ));
    }

    let mut seen = std::collections::HashSet::new();
    let mut requests = Vec::with_capacity(profile.harnesses.len());
    for harness in &profile.harnesses {
        let expected_base_url = expected_harness_base_url(&harness.app).ok_or_else(|| {
            AppError::InvalidInput(format!("Unsupported ACS harness: {}", harness.app))
        })?;
        if harness.base_url != expected_base_url {
            return Err(AppError::InvalidInput(format!(
                "Invalid ACS endpoint for {}",
                harness.app
            )));
        }
        if !seen.insert(harness.app.as_str()) {
            return Err(AppError::InvalidInput(format!(
                "Duplicate ACS harness: {}",
                harness.app
            )));
        }
        if harness
            .model
            .as_deref()
            .is_some_and(|model| model.len() > 200)
        {
            return Err(AppError::InvalidInput(format!(
                "Invalid model for {}",
                harness.app
            )));
        }

        let app_type = AppType::from_str(&harness.app)
            .map_err(|_| AppError::InvalidInput(format!("Invalid app: {}", harness.app)))?;
        let provider_request = DeepLinkImportRequest {
            version: "v1".to_string(),
            resource: "provider".to_string(),
            app: Some(harness.app.clone()),
            name: Some(format!("ACS Gateway - {}", profile.name.trim())),
            enabled: Some(true),
            homepage: Some(ACS_GATEWAY_ORIGIN.to_string()),
            endpoint: Some(harness.base_url.clone()),
            api_key: Some(profile.api_key.clone()),
            icon: Some(icon_for_harness(&harness.app).to_string()),
            model: harness
                .model
                .clone()
                .filter(|model| !model.trim().is_empty()),
            notes: Some("Managed by ACS Gateway profile".to_string()),
            ..Default::default()
        };

        build_provider_from_request(&app_type, &provider_request)?;
        requests.push(provider_request);
    }
    Ok(requests)
}

fn expected_harness_base_url(app: &str) -> Option<&'static str> {
    match app {
        "claude" => Some("https://acsgw.top/claude"),
        "codex" => Some("https://acsgw.top/openai"),
        "gemini" => Some("https://acsgw.top/gemini"),
        "grokbuild" => Some("https://acsgw.top/grok/v1"),
        "opencode" | "openclaw" | "hermes" => Some("https://acsgw.top/v1"),
        _ => None,
    }
}

fn icon_for_harness(app: &str) -> &'static str {
    match app {
        "claude" => "anthropic",
        "codex" | "opencode" | "openclaw" | "hermes" => "openai",
        "gemini" => "gemini",
        "grokbuild" => "grok",
        _ => "generic",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_profile() -> AcsProvisionProfile {
        AcsProvisionProfile {
            version: 1,
            gateway_origin: ACS_GATEWAY_ORIGIN.to_string(),
            name: "team-a".to_string(),
            api_key: "acs_test_key".to_string(),
            api_key_id: 1,
            allowed_models: vec!["*".to_string()],
            provider_group_bindings: vec![],
            harnesses: vec![AcsProvisionHarness {
                app: "claude".to_string(),
                base_url: "https://acsgw.top/claude".to_string(),
                model: Some("claude-sonnet".to_string()),
            }],
            expires_at: Utc::now() + chrono::Duration::minutes(5),
        }
    }

    #[test]
    fn validates_and_builds_fixed_gateway_provider() {
        let requests = validate_and_build_provider_requests(&valid_profile()).expect("profile");
        assert_eq!(requests.len(), 1);
        assert_eq!(
            requests[0].endpoint.as_deref(),
            Some("https://acsgw.top/claude")
        );
        assert_eq!(requests[0].enabled, Some(true));
    }

    #[test]
    fn rejects_endpoint_substitution() {
        let mut profile = valid_profile();
        profile.harnesses[0].base_url = "https://attacker.example".to_string();
        assert!(validate_and_build_provider_requests(&profile).is_err());
    }
}
