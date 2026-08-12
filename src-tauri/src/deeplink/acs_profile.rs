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
    allowed_models: Vec<String>,
    provider_group_bindings: Vec<AcsProvisionBinding>,
    harnesses: Vec<AcsProvisionHarness>,
    expires_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct AcsProvisionBinding {
    account_type: String,
    group_id: u64,
    group_name: String,
}

#[derive(Debug, Deserialize)]
struct AcsProvisionHarness {
    app: String,
    base_url: String,
    api_format: String,
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
    if !profile.api_key.starts_with("acs_client_v1_") || profile.api_key.len() > 128 {
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
    let notes = build_profile_notes(profile);
    for harness in &profile.harnesses {
        let expected_config = expected_harness_config(&harness.app).ok_or_else(|| {
            AppError::InvalidInput(format!("Unsupported ACS harness: {}", harness.app))
        })?;
        if harness.base_url != expected_config.base_url
            || harness.api_format != expected_config.api_format
        {
            return Err(AppError::InvalidInput(format!(
                "Invalid ACS endpoint or API format for {}",
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
            api_format: Some(harness.api_format.clone()),
            notes: Some(notes.clone()),
            ..Default::default()
        };

        build_provider_from_request(&app_type, &provider_request)?;
        requests.push(provider_request);
    }
    Ok(requests)
}

fn build_profile_notes(profile: &AcsProvisionProfile) -> String {
    let mut groups = profile
        .provider_group_bindings
        .iter()
        .map(|binding| {
            let name = if binding.group_name.trim().is_empty() {
                format!("Group {}", binding.group_id)
            } else {
                binding.group_name.trim().to_string()
            };
            if binding.account_type.trim().is_empty() {
                name
            } else {
                format!("{}: {name}", binding.account_type.trim())
            }
        })
        .collect::<Vec<_>>();
    groups.sort();
    groups.dedup();

    let group_summary = if groups.is_empty() {
        "Default routing".to_string()
    } else {
        groups.join(" / ")
    };
    let model_summary = if profile.allowed_models.is_empty()
        || profile.allowed_models.iter().any(|model| model == "*")
    {
        "All models".to_string()
    } else {
        profile.allowed_models.join(", ")
    };

    format!(
        "Managed by ACS Gateway profile\nGroups: {group_summary}\nAllowed models: {model_summary}"
    )
}

struct HarnessConfig {
    base_url: &'static str,
    api_format: &'static str,
}

fn expected_harness_config(app: &str) -> Option<HarnessConfig> {
    match app {
        "claude" => Some(HarnessConfig {
            base_url: "https://acsgw.top/claude",
            api_format: "anthropic",
        }),
        "codex" => Some(HarnessConfig {
            base_url: "https://acsgw.top/openai",
            api_format: "openai_responses",
        }),
        "gemini" => Some(HarnessConfig {
            base_url: "https://acsgw.top/gemini",
            api_format: "gemini_native",
        }),
        "grokbuild" => Some(HarnessConfig {
            base_url: "https://acsgw.top/grok/v1",
            api_format: "openai_responses",
        }),
        "opencode" | "openclaw" | "hermes" => Some(HarnessConfig {
            base_url: "https://acsgw.top/v1",
            api_format: "openai_chat",
        }),
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
            api_key: "acs_client_v1_z_test_signature".to_string(),
            api_key_id: 1,
            allowed_models: vec!["*".to_string()],
            provider_group_bindings: vec![AcsProvisionBinding {
                account_type: "claude".to_string(),
                group_id: 7,
                group_name: "Primary".to_string(),
            }],
            harnesses: vec![AcsProvisionHarness {
                app: "claude".to_string(),
                base_url: "https://acsgw.top/claude".to_string(),
                api_format: "anthropic".to_string(),
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
        assert_eq!(requests[0].api_format.as_deref(), Some("anthropic"));
        assert!(requests[0]
            .notes
            .as_deref()
            .is_some_and(|notes| notes.contains("Groups: claude: Primary")));
    }

    #[test]
    fn rejects_endpoint_substitution() {
        let mut profile = valid_profile();
        profile.harnesses[0].base_url = "https://attacker.example".to_string();
        assert!(validate_and_build_provider_requests(&profile).is_err());
    }

    #[test]
    fn rejects_api_format_substitution() {
        let mut profile = valid_profile();
        profile.harnesses[0].api_format = "openai_chat".to_string();
        assert!(validate_and_build_provider_requests(&profile).is_err());
    }

    #[test]
    fn builds_native_configuration_for_every_harness() {
        let mut profile = valid_profile();
        profile.harnesses = [
            ("claude", "https://acsgw.top/claude", "anthropic"),
            ("codex", "https://acsgw.top/openai", "openai_responses"),
            ("gemini", "https://acsgw.top/gemini", "gemini_native"),
            ("grokbuild", "https://acsgw.top/grok/v1", "openai_responses"),
            ("opencode", "https://acsgw.top/v1", "openai_chat"),
            ("openclaw", "https://acsgw.top/v1", "openai_chat"),
            ("hermes", "https://acsgw.top/v1", "openai_chat"),
        ]
        .into_iter()
        .map(|(app, base_url, api_format)| AcsProvisionHarness {
            app: app.to_string(),
            base_url: base_url.to_string(),
            api_format: api_format.to_string(),
            model: Some("routed-model".to_string()),
        })
        .collect();

        let requests = validate_and_build_provider_requests(&profile).expect("profile");
        for request in requests {
            let app = AppType::from_str(request.app.as_deref().expect("app")).expect("app type");
            let provider = build_provider_from_request(&app, &request).expect("provider");
            assert_eq!(
                provider
                    .meta
                    .as_ref()
                    .and_then(|meta| meta.api_format.as_deref()),
                request.api_format.as_deref()
            );

            match app {
                AppType::Claude => {
                    assert_eq!(
                        provider.settings_config["env"]["ANTHROPIC_MODEL"],
                        "routed-model"
                    );
                    assert_eq!(
                        provider.settings_config["env"]["ANTHROPIC_BASE_URL"],
                        "https://acsgw.top/claude"
                    );
                }
                AppType::Codex => {
                    let config = provider.settings_config["config"].as_str().expect("config");
                    assert!(config.contains("model = \"routed-model\""));
                    assert!(config.contains("wire_api = \"responses\""));
                }
                AppType::Gemini => {
                    assert_eq!(
                        provider.settings_config["env"]["GEMINI_MODEL"],
                        "routed-model"
                    );
                    assert_eq!(
                        provider.settings_config["env"]["GOOGLE_GEMINI_BASE_URL"],
                        "https://acsgw.top/gemini"
                    );
                }
                AppType::GrokBuild => {
                    let config = provider.settings_config["config"].as_str().expect("config");
                    assert!(config.contains("model = \"routed-model\""));
                    assert!(config.contains("api_backend = \"responses\""));
                }
                AppType::OpenCode => {
                    assert_eq!(provider.settings_config["npm"], "@ai-sdk/openai-compatible");
                    assert_eq!(
                        provider.settings_config["options"]["baseURL"],
                        "https://acsgw.top/v1"
                    );
                }
                AppType::OpenClaw => {
                    assert_eq!(provider.settings_config["api"], "openai-completions");
                    assert_eq!(provider.settings_config["baseUrl"], "https://acsgw.top/v1");
                }
                AppType::Hermes => {
                    assert_eq!(provider.settings_config["api_mode"], "chat_completions");
                    assert_eq!(provider.settings_config["base_url"], "https://acsgw.top/v1");
                }
                AppType::ClaudeDesktop => unreachable!("not part of the ACS harness catalog"),
            }
        }
    }
}
