// The bar of links along the bottom of a phone's screen (NavbarComp.tsx).
//
// An iPhone's Safari colors the strip behind its address bar from whatever
// is fixed to the bottom of the page, and it picks that color at the instant
// an overlay opens, then keeps it while the overlay is up. So before a
// pop-up or a big film is drawn, the green bar is put away: the strip then
// takes the overlay's color, not green. It comes back when the last of them
// closes. paper.css hides the bar while <html> has the class.
const away = new Set<string>();

export function putBarAway(who: string, on: boolean) {
  if (on) away.add(who);
  else away.delete(who);
  document.documentElement.classList.toggle("paper-bar-away", away.size > 0);
}
