// Riel de latón con hasta 3 comandas colgadas.

import { COLORS, CSS } from "./palette.js";
import { TicketView, TICKET_W, TICKET_H } from "./ticket.js";

export const RAIL_SLOTS = 3;

export class RailView {
  /**
   * @param {Phaser.Scene} scene
   * @param {import("../core/catalog.js").Catalog} catalog
   * @param {{ onTicketTap: (id: number) => void }} callbacks
   * @param {import("./ticket.js").TicketOptions} options
   */
  constructor(scene, catalog, callbacks, options) {
    this.scene = scene;
    this.catalog = catalog;
    this.callbacks = callbacks;
    this.options = { ...options };
    this.root = scene.add.container(0, 0);
    this.bar = scene.add.graphics();
    this.root.add(this.bar);
    /** @type {Map<number, TicketView>} */
    this.tickets = new Map();
    /** @type {(number|null)[]} */
    this.slots = new Array(RAIL_SLOTS).fill(null);
    this.region = { x: 0, y: 0, w: 1280, h: 240 };
    this.ticketScale = 1;
  }

  /** @param {{ x: number, y: number, w: number, h: number }} region */
  layout(region) {
    this.region = region;
    const slotW = region.w / RAIL_SLOTS;
    this.ticketScale = Math.min((slotW * 0.9) / TICKET_W, (region.h - 34) / (TICKET_H + 14), 1.2);
    const g = this.bar;
    g.clear();
    const y = region.y + 18;
    g.fillStyle(COLORS.black, 0.35);
    g.fillRoundedRect(region.x + 10, y - 3, region.w - 20, 16, 8);
    g.fillStyle(COLORS.brassDark, 1);
    g.fillRoundedRect(region.x + 8, y - 8, region.w - 16, 14, 7);
    g.fillStyle(COLORS.brass, 1);
    g.fillRoundedRect(region.x + 8, y - 8, region.w - 16, 8, 4);
    g.fillStyle(COLORS.brassLight, 0.8);
    g.fillRect(region.x + 20, y - 7, region.w - 40, 2);
    for (const x of [region.x + 14, region.x + region.w - 14]) {
      g.fillStyle(COLORS.brassDark, 1);
      g.fillCircle(x, y - 1, 11);
      g.fillStyle(COLORS.brass, 1);
      g.fillCircle(x - 2, y - 3, 8);
    }
    for (const ticket of this.tickets.values()) {
      if (!ticket.leaving) this.placeTicket(ticket, false);
    }
  }

  slotPosition(slot) {
    const r = this.region;
    return { x: r.x + (r.w / RAIL_SLOTS) * (slot + 0.5), y: r.y + 22 };
  }

  placeTicket(ticket, animate) {
    const pos = this.slotPosition(ticket.slot);
    ticket.root.setScale(this.ticketScale);
    if (animate && !this.options.reducedMotion) {
      ticket.root.setPosition(this.region.x + this.region.w + TICKET_W, pos.y);
      this.scene.tweens.add({ targets: ticket.root, x: pos.x, duration: 420, ease: "Back.easeOut" });
    } else {
      ticket.root.setPosition(pos.x, pos.y);
    }
  }

  /**
   * Sincroniza con las comandas del estado de sesión.
   * @param {Array<import("../core/session.js").RailOrder & { patienceLeft: number|null }>} orders
   * @param {{ deliverable: boolean }} flags
   */
  sync(orders, flags) {
    const ids = new Set(orders.map((o) => o.id));
    for (const [id, ticket] of this.tickets) {
      if (!ids.has(id) && !ticket.leaving) this.release(id, "silent");
    }
    for (const order of orders) {
      let ticket = this.tickets.get(order.id);
      if (!ticket) {
        const slot = this.slots.indexOf(null);
        if (slot === -1) continue;
        ticket = new TicketView(this.scene, this.catalog, order, this.options, (id) => this.callbacks.onTicketTap(id));
        ticket.slot = slot;
        this.slots[slot] = order.id;
        this.tickets.set(order.id, ticket);
        this.root.add(ticket.root);
        this.placeTicket(ticket, true);
      }
      ticket.setHidden(order.hidden, true);
      ticket.setPatience(order.patienceLeft);
      ticket.setHighlight(flags.deliverable);
    }
  }

  /**
   * Retira una comanda con animación.
   * @param {number} id
   * @param {"served"|"missed"|"silent"} how
   */
  release(id, how) {
    const ticket = this.tickets.get(id);
    if (!ticket || ticket.leaving) return;
    ticket.leaving = true;
    ticket.setHighlight(false);
    if (ticket.slot >= 0) this.slots[ticket.slot] = null;
    const done = () => {
      this.tickets.delete(id);
      ticket.destroy();
    };
    if (how === "silent" || this.options.reducedMotion) {
      if (how === "served") ticket.stamp("SERVIDA", CSS.tealDark);
      if (how === "missed") ticket.stamp("PERDIDA", CSS.brick);
      this.scene.time.delayedCall(how === "silent" ? 0 : 500, done);
      return;
    }
    if (how === "served") {
      ticket.setHidden(false, false);
      ticket.stamp("SERVIDA", CSS.tealDark);
      this.scene.tweens.add({
        targets: ticket.root,
        y: ticket.root.y - 40,
        alpha: 0,
        delay: 450,
        duration: 380,
        ease: "Sine.easeIn",
        onComplete: done,
      });
    } else {
      ticket.setHidden(false, false);
      ticket.stamp("PERDIDA", CSS.brick);
      this.scene.tweens.add({
        targets: ticket.root,
        y: ticket.root.y + 160,
        angle: ticket.baseAngle + 28,
        alpha: 0,
        delay: 500,
        duration: 520,
        ease: "Quad.easeIn",
        onComplete: done,
      });
    }
  }

  shake(id) {
    this.tickets.get(id)?.shake();
  }

  /** @param {Partial<import("./ticket.js").TicketOptions>} options */
  setOptions(options) {
    Object.assign(this.options, options);
    for (const ticket of this.tickets.values()) {
      Object.assign(ticket.options, options);
      if (!ticket.leaving) ticket.build();
    }
  }

  clear() {
    for (const ticket of this.tickets.values()) ticket.destroy();
    this.tickets.clear();
    this.slots.fill(null);
  }

  /** Centro de una comanda en coordenadas del mundo (para pruebas y accesibilidad). */
  ticketCenter(id) {
    const ticket = this.tickets.get(id);
    if (!ticket) return null;
    const m = ticket.hit.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  }
}
