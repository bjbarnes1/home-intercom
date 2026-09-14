import SwiftUI

/// Hold to talk. The press must open the microphone on touch-down and close it
/// on release — a tap-to-toggle intercom is how you broadcast a private
/// conversation to the whole house by accident.
@MainActor
struct TalkButton: View {
    let identity: String?
    let isLive: Bool
    let isBusy: Bool
    var label: String = "Hold to talk"
    let onPress: () -> Void
    let onRelease: () -> Void

    @Environment(\.colorScheme) private var scheme
    @State private var isPressed = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.tint(identity, step: isLive ? 4 : 2, scheme: scheme))
            Circle()
                .strokeBorder(Theme.ident(identity, scheme: scheme), lineWidth: isLive ? 3 : 1)

            VStack(spacing: 8) {
                Image(systemName: isBusy ? "ellipsis" : (isLive ? "waveform" : "mic.fill"))
                    .font(.system(size: 40, weight: .medium))
                    .symbolEffect(.variableColor.iterative, isActive: isLive)
                Text(isLive ? "On air" : label)
                    .font(.subheadline.weight(.medium))
            }
            .foregroundStyle(isLive ? Theme.ident(identity, scheme: scheme) : Theme.ground(for: scheme).ink)
        }
        .frame(width: 200, height: 200)
        .scaleEffect(isPressed ? 0.96 : 1)
        .shadow(color: Theme.ident(identity, scheme: scheme).opacity(isLive ? 0.45 : 0), radius: 24)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
        .animation(.easeOut(duration: 0.2), value: isLive)
        .contentShape(Circle())
        // A drag gesture with zero minimum distance is the only way to get a
        // true touch-down/touch-up pair; Button fires on touch-*up*.
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard !isPressed else { return }
                    isPressed = true
                    onPress()
                }
                .onEnded { _ in
                    isPressed = false
                    onRelease()
                }
        )
        .accessibilityRepresentation {
            // VoiceOver can't hold a button down, so expose a plain toggle.
            Button(isLive ? "Stop talking" : label) {
                if isLive { onRelease() } else { onPress() }
            }
        }
    }
}
