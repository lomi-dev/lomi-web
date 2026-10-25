import CoreGraphics
import Foundation

if CommandLine.arguments.count == 2, CommandLine.arguments[1] == "--hide-cursor" {
    let display = CGMainDisplayID()
    let originalCursor = CGEvent(source: nil)?.location
    let bounds = CGDisplayBounds(display)
    let moved = CGWarpMouseCursorPosition(
        CGPoint(x: bounds.maxX - 2, y: bounds.maxY - 2)
    ) == .success
    let hidden = CGDisplayHideCursor(display) == .success
    guard moved || hidden else {
        fputs("Could not hide the cursor.\n", stderr)
        exit(1)
    }
    FileHandle.standardOutput.write(Data("cursor-hidden\n".utf8))
    _ = readLine()
    if hidden { _ = CGDisplayShowCursor(display) }
    if moved, let originalCursor { _ = CGWarpMouseCursorPosition(originalCursor) }
    exit(0)
}

guard CommandLine.arguments.count == 2, let pid = Int32(CommandLine.arguments[1]) else {
    fputs("Usage: window-info.swift <pid>\n", stderr)
    exit(2)
}

guard let raw = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] else {
    fputs("Cannot enumerate on-screen windows.\n", stderr)
    exit(1)
}

let matches = raw.compactMap { window -> [String: Any]? in
    guard (window[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid,
          let number = (window[kCGWindowNumber as String] as? NSNumber)?.intValue,
          let bounds = window[kCGWindowBounds as String] as? [String: NSNumber]
    else { return nil }
    let normalizedBounds = bounds.mapValues(\.doubleValue)
    return [
        "windowId": number,
        "owner": window[kCGWindowOwnerName as String] as? String ?? "",
        "title": window[kCGWindowName as String] as? String ?? "",
        "bounds": normalizedBounds,
        "layer": window[kCGWindowLayer as String] as? Int ?? -1,
        "screenRecordingAllowed": CGPreflightScreenCaptureAccess(),
    ]
}.sorted {
    (($0["bounds"] as? [String: Double])?["Width"] ?? 0) * (($0["bounds"] as? [String: Double])?["Height"] ?? 0) >
        (($1["bounds"] as? [String: Double])?["Width"] ?? 0) * (($1["bounds"] as? [String: Double])?["Height"] ?? 0)
}

guard !matches.isEmpty else {
    fputs("No on-screen native window for pid \(pid).\n", stderr)
    exit(1)
}

let data = try JSONSerialization.data(withJSONObject: matches, options: [.sortedKeys])
print(String(decoding: data, as: UTF8.self))
