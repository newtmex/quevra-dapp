import WalletButton from "./WalletButton";

export default function TopBar() {
  return (
    <div className="top-bar color-scheme-transparent quevra-topbar">
      <div className="quevra-topbar__brand"><span className="quevra-logo">Q</span><div><strong>Quevra</strong><span>Protocol dashboard</span></div></div>
      <div className="quevra-topbar__actions"><span className="network-chip"><i /> Monad Testnet</span><WalletButton /></div>
    </div>
  );
}
