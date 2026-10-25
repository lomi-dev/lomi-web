use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

fn directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let identifier = std::env::var("LOMI_FEATURE_MOVIES_IDENTIFIER")
        .map_err(|error| error.to_string())?;
    if !identifier.starts_with("dev.lomi.desktop-smoke-feature-movies-")
        || app.config().identifier != identifier
    {
        return Err("Feature movie capture requires its isolated app identity.".into());
    }
    let expected = PathBuf::from(
        std::env::var("LOMI_FEATURE_MOVIES_APP_DATA").map_err(|error| error.to_string())?,
    );
    let actual = app.path().app_data_dir().map_err(|error| error.to_string())?;
    if std::fs::canonicalize(&actual).map_err(|error| error.to_string())?
        != std::fs::canonicalize(&expected).map_err(|error| error.to_string())?
    {
        return Err("Feature movie capture profile is not isolated.".into());
    }
    Ok(PathBuf::from(
        std::env::var("LOMI_FEATURE_MOVIES_DIRECTORY").map_err(|error| error.to_string())?,
    ))
}

fn control(directory: &std::path::Path) -> Result<Value, String> {
    let path = directory.join("control.json");
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(json!({"started": false}))
        }
        Err(error) => Err(error.to_string()),
    }
}

pub fn page(webview: &tauri::Webview, payload: &tauri::webview::PageLoadPayload<'_>) {
    if webview.label() != "main"
        || !matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
    {
        return;
    }
    if directory(webview.app_handle()).is_err() {
        webview.app_handle().exit(1);
        return;
    }
    let script = directory(webview.app_handle())
        .and_then(|directory| {
            std::fs::read_to_string(directory.join("feature-movies.js"))
                .map_err(|error| error.to_string())
        });
    match script.and_then(|script| webview.eval(&script).map_err(|error| error.to_string())) {
        Ok(()) => {}
        Err(error) => {
            eprintln!("Feature movie capture hook failed: {error}");
            webview.app_handle().exit(1);
        }
    }
}

pub fn result(
    app: &tauri::AppHandle,
    stage: &str,
    data: Value,
) -> Result<Value, String> {
    if app.get_webview("main").is_none() {
        return Err("Feature movie command requires the main webview.".into());
    }
    let directory = directory(app)?;
    match stage {
        "feature-movie-control" => control(&directory),
        "feature-movie-ready" => {
            std::fs::write(directory.join("ready.json"), b"{\"ready\":true}\n")
                .map_err(|error| error.to_string())?;
            Ok(Value::Null)
        }
        "feature-movie-progress" => {
            std::fs::write(
                directory.join("progress.json"),
                serde_json::to_vec_pretty(&data).map_err(|error| error.to_string())?,
            )
            .map_err(|error| error.to_string())?;
            Ok(Value::Null)
        }
        "feature-movie-exit" => {
            app.exit(0);
            Ok(Value::Null)
        }
        "feature-movie-browser-eval" => {
            let id = data
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| {
                    !id.is_empty()
                        && id.len() <= 128
                        && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
                })
                .ok_or("Invalid feature movie browser ID.")?;
            let script = data
                .get("script")
                .and_then(Value::as_str)
                .filter(|script| script.len() <= 10_000)
                .ok_or("Invalid feature movie browser action.")?;
            let view = app
                .get_webview(&format!("browser-{id}"))
                .ok_or("The local native browser view is not open.")?;
            let url = view.url().map_err(|error| error.to_string())?;
            if url.host_str() != Some("127.0.0.1") {
                return Err("Feature movie browser actions are limited to the local fixture.".into());
            }
            view.eval(script).map_err(|error| error.to_string())?;
            Ok(json!({"dispatched": true, "url": url.as_str()}))
        }
        _ => Err("Unknown feature movie stage.".into()),
    }
}
