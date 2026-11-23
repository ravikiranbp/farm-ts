import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import type { Offer } from "@/lib/types";

const SEEN_KEY = "vt_offer_seen";
const SHOW_AFTER_MS = 2000;
const AUTO_CLOSE_MS = 10000;

// Image-only popup on the home page, shown once per browser session for each posted image.
export default function OfferOverlay({ offer }: { offer?: Offer | null }) {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		if (!offer || sessionStorage.getItem(SEEN_KEY) === offer.id) return;
		const t = setTimeout(() => setOpen(true), SHOW_AFTER_MS);
		return () => clearTimeout(t);
	}, [offer]);

	useEffect(() => {
		if (!open || !offer) return;
		sessionStorage.setItem(SEEN_KEY, offer.id);
		const t = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		window.addEventListener("keydown", onKey);
		return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
	}, [open, offer]);

	if (!open || !offer) return null;
	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Current offer" data-testid="offer-overlay">
			<div className="relative" onClick={(e) => e.stopPropagation()}>
				<img src={offer.image_url} alt="Current offer" className="block max-h-[85vh] max-w-[92vw] cursor-pointer object-contain"
					onClick={() => { setOpen(false); navigate("/quote?offer=1"); }} data-testid="offer-overlay-image" />
				<button type="button" aria-label="Close" onClick={() => setOpen(false)} data-testid="offer-overlay-close"
					className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
					<X className="h-5 w-5" />
				</button>
			</div>
		</div>
	);
}
