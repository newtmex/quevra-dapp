import WalletButton from "./WalletButton";

export default function TopBar() {
  return (
    <header className="qv:flex qv:min-h-[65px] qv:items-center qv:justify-between qv:border-b qv:border-white/[0.075] qv:bg-[#0e0f16] qv:px-[18px] qv:sm:min-h-[76px] qv:sm:px-[4vw]">
      <div className="qv:flex qv:items-center qv:gap-[11px]">
        <span className="qv:grid qv:size-[34px] qv:place-items-center qv:rounded-[11px] qv:bg-gradient-to-br qv:from-[#a291ff] qv:to-[#644ce1] qv:text-lg qv:font-bold qv:text-white qv:shadow-[0_5px_18px_rgba(114,91,238,0.35)]">Q</span>
        <div className="qv:grid qv:gap-0.5">
          <strong className="qv:text-[15px] qv:tracking-[-0.02em] qv:text-[#f2f2f8]">Quevra</strong>
          <span className="qv:hidden qv:text-[11px] qv:text-[#888b9e] qv:sm:block">Protocol dashboard</span>
        </div>
      </div>
      <div className="qv:flex qv:items-center qv:gap-3.5">
        <span className="qv:hidden qv:items-center qv:gap-2 qv:rounded-full qv:border qv:border-white/[0.075] qv:px-3 qv:py-[9px] qv:text-xs qv:text-[#c1c2ce] qv:sm:inline-flex">
          <i className="qv:size-[7px] qv:rounded-full qv:bg-[#52ddc3] qv:shadow-[0_0_10px_rgba(82,221,195,0.5)]" /> Monad Testnet
        </span>
        <WalletButton />
      </div>
    </header>
  );
}
