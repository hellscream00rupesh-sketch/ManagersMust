import { useEffect, useRef, useState } from "react";

export default function SideNavigation({ items, activeTab, onNavigate, renderIcon }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    panelRef.current.querySelector('[aria-current="page"]')?.focus();

    const onPointerDown = (event) => {
      if (!containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        toggleRef.current.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      className={`side-navigation${isOpen ? " open" : ""}`}
      ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="navigation-toggle"
        ref={toggleRef}
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={isOpen}
        aria-controls="primary-navigation"
        onClick={() => setIsOpen((previous) => !previous)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m10 6 6 6-6 6" />
        </svg>
      </button>
      <nav
        id="primary-navigation"
        className="side-navigation-panel"
        aria-label="Primary navigation"
        aria-hidden={!isOpen}
        inert={!isOpen}
        ref={panelRef}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={activeTab === item.key ? "nav-item active" : "nav-item"}
            aria-current={activeTab === item.key ? "page" : undefined}
            onClick={() => {
              setIsOpen(false);
              toggleRef.current.focus();
              onNavigate(item.key);
            }}
          >
            {renderIcon(item.key)}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
