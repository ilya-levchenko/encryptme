import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var privacyCover: UIView?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        guard let window, privacyCover == nil else { return }
        let cover = UIView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = UIColor(red: 8 / 255, green: 17 / 255, blue: 31 / 255, alpha: 1)

        let symbol = UIImageView(image: UIImage(systemName: "lock.shield.fill"))
        symbol.tintColor = UIColor(red: 103 / 255, green: 169 / 255, blue: 1, alpha: 1)
        symbol.contentMode = .scaleAspectFit
        symbol.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = "EncryptMe"
        title.textColor = .white
        title.font = .systemFont(ofSize: 19, weight: .semibold)
        title.translatesAutoresizingMaskIntoConstraints = false

        cover.addSubview(symbol)
        cover.addSubview(title)
        NSLayoutConstraint.activate([
            symbol.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            symbol.centerYAnchor.constraint(equalTo: cover.centerYAnchor, constant: -18),
            symbol.widthAnchor.constraint(equalToConstant: 42),
            symbol.heightAnchor.constraint(equalToConstant: 42),
            title.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            title.topAnchor.constraint(equalTo: symbol.bottomAnchor, constant: 14)
        ])
        window.addSubview(cover)
        privacyCover = cover
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }
}
