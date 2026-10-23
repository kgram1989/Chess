/* Chess engine: rules, move generation, and alpha-beta search.
   Board: 64-element array, index = row*8 + col, row 0 = rank 8 (top). '' = empty.
   Uppercase = white, lowercase = black. */
(function (root) {
  'use strict';

  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const colorOf = p => (p ? (p === p.toUpperCase() ? 'w' : 'b') : null);
  const sqName = i => FILES[i & 7] + (8 - (i >> 3));

  function parseFEN(fen) {
    const [pos, turn, cr, ep, half, full] = fen.split(' ');
    const board = [];
    for (const ch of pos) {
      if (ch === '/') continue;
      if (/\d/.test(ch)) for (let k = 0; k < +ch; k++) board.push('');
      else board.push(ch);
    }
    let epSq = -1;
    if (ep && ep !== '-') epSq = FILES.indexOf(ep[0]) + (8 - +ep[1]) * 8;
    return { board, turn, cr: cr === '-' ? '' : cr, ep: epSq, half: +half || 0, full: +full || 1 };
  }

  const initState = () => parseFEN(START_FEN);

  const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const KG = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function attacked(b, sq, by) {
    const r = sq >> 3, c = sq & 7, w = by === 'w';
    const pr = w ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) {
      const P = w ? 'P' : 'p';
      if (c > 0 && b[pr * 8 + c - 1] === P) return true;
      if (c < 7 && b[pr * 8 + c + 1] === P) return true;
    }
    const N = w ? 'N' : 'n', K = w ? 'K' : 'k';
    for (const [dr, dc] of KN) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === N) return true;
    }
    for (const [dr, dc] of KG) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === K) return true;
    }
    const B = w ? 'B' : 'b', R = w ? 'R' : 'r', Q = w ? 'Q' : 'q';
    for (const [dr, dc] of DIAG) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const p = b[rr * 8 + cc];
        if (p) { if (p === B || p === Q) return true; break; }
        rr += dr; cc += dc;
      }
    }
    for (const [dr, dc] of ORTH) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const p = b[rr * 8 + cc];
        if (p) { if (p === R || p === Q) return true; break; }
        rr += dr; cc += dc;
      }
    }
    return false;
  }

  function kingSq(b, color) {
    const k = color === 'w' ? 'K' : 'k';
    return b.indexOf(k);
  }

  function inCheck(s, color) {
    color = color || s.turn;
    const k = kingSq(s.board, color);
    return k >= 0 && attacked(s.board, k, color === 'w' ? 'b' : 'w');
  }

  function pseudoMoves(s) {
    const b = s.board, side = s.turn, w = side === 'w', moves = [];
    const enemy = w ? 'b' : 'w';
    const add = (from, to, flag, promo) => moves.push({ from, to, flag, promo });

    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || colorOf(p) !== side) continue;
      const t = p.toUpperCase(), r = i >> 3, c = i & 7;

      if (t === 'P') {
        const dir = w ? -1 : 1, startR = w ? 6 : 1, promR = w ? 0 : 7, nr = r + dir;
        if (nr < 0 || nr > 7) continue;
        const push = (to, flag) => {
          if (nr === promR) for (const pr of 'QRBN') add(i, to, flag, pr);
          else add(i, to, flag);
        };
        if (!b[nr * 8 + c]) {
          push(nr * 8 + c);
          if (r === startR && !b[(r + 2 * dir) * 8 + c]) add(i, (r + 2 * dir) * 8 + c, 'd');
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (cc < 0 || cc > 7) continue;
          const to = nr * 8 + cc;
          if (b[to] && colorOf(b[to]) === enemy) push(to);
          else if (to === s.ep) add(i, to, 'e');
        }
      } else if (t === 'N' || t === 'K') {
        for (const [dr, dc] of t === 'N' ? KN : KG) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
          const to = rr * 8 + cc;
          if (!b[to] || colorOf(b[to]) === enemy) add(i, to);
        }
      } else {
        const dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : DIAG.concat(ORTH);
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
            const to = rr * 8 + cc;
            if (b[to]) { if (colorOf(b[to]) === enemy) add(i, to); break; }
            add(i, to);
            rr += dr; cc += dc;
          }
        }
      }
    }

    // Castling
    const home = w ? 60 : 4, K = w ? 'K' : 'k', R = w ? 'R' : 'r';
    if (b[home] === K && !attacked(b, home, enemy)) {
      if (s.cr.includes(w ? 'K' : 'k') && b[home + 3] === R && !b[home + 1] && !b[home + 2] &&
          !attacked(b, home + 1, enemy) && !attacked(b, home + 2, enemy)) add(home, home + 2, 'c');
      if (s.cr.includes(w ? 'Q' : 'q') && b[home - 4] === R && !b[home - 1] && !b[home - 2] && !b[home - 3] &&
          !attacked(b, home - 1, enemy) && !attacked(b, home - 2, enemy)) add(home, home - 2, 'c');
    }
    return moves;
  }

  function apply(s, m) {
    const b = s.board.slice(), p = b[m.from], w = s.turn === 'w';
    b[m.from] = '';
    if (m.flag === 'e') b[w ? m.to + 8 : m.to - 8] = '';
    b[m.to] = m.promo ? (w ? m.promo : m.promo.toLowerCase()) : p;
    if (m.flag === 'c') {
      if (m.to > m.from) { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = ''; }
      else { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = ''; }
    }
    let cr = s.cr;
    if (cr) {
      if (p === 'K') cr = cr.replace(/[KQ]/g, '');
      if (p === 'k') cr = cr.replace(/[kq]/g, '');
      for (const sq of [m.from, m.to]) {
        if (sq === 63) cr = cr.replace('K', '');
        else if (sq === 56) cr = cr.replace('Q', '');
        else if (sq === 7) cr = cr.replace('k', '');
        else if (sq === 0) cr = cr.replace('q', '');
      }
    }
    const reset = p === 'P' || p === 'p' || s.board[m.to] || m.flag === 'e';
    return {
      board: b,
      turn: w ? 'b' : 'w',
      cr,
      ep: m.flag === 'd' ? (m.from + m.to) / 2 : -1,
      half: reset ? 0 : s.half + 1,
      full: w ? s.full : s.full + 1,
    };
  }

  function legal(s) {
    const out = [], me = s.turn, opp = me === 'w' ? 'b' : 'w';
    for (const m of pseudoMoves(s)) {
      const ns = apply(s, m);
      const k = kingSq(ns.board, me);
      if (k >= 0 && !attacked(ns.board, k, opp)) out.push(m);
    }
    return out;
  }

  function positionKey(s) {
    return s.board.map(p => p || '.').join('') + s.turn + s.cr + (s.ep >= 0 && epUsable(s) ? s.ep : '');
  }
  function epUsable(s) { return legal(s).some(m => m.flag === 'e'); }

  function insufficientMaterial(s) {
    const minors = [];
    for (const p of s.board) {
      if (!p) continue;
      const t = p.toUpperCase();
      if (t === 'K') continue;
      if (t === 'N' || t === 'B') minors.push(t); else return false;
    }
    return minors.length <= 1;
  }

  function san(s, m, moves) {
    const piece = s.board[m.from], p = piece.toUpperCase();
    let t;
    if (m.flag === 'c') t = m.to > m.from ? 'O-O' : 'O-O-O';
    else {
      const cap = s.board[m.to] || m.flag === 'e';
      t = '';
      if (p === 'P') { if (cap) t += FILES[m.from & 7]; }
      else {
        t += p;
        const others = moves.filter(o => o !== m && o.to === m.to && s.board[o.from] === piece);
        if (others.length) {
          const sameFile = others.some(o => (o.from & 7) === (m.from & 7));
          const sameRank = others.some(o => (o.from >> 3) === (m.from >> 3));
          if (!sameFile) t += FILES[m.from & 7];
          else if (!sameRank) t += 8 - (m.from >> 3);
          else t += sqName(m.from);
        }
      }
      if (cap) t += 'x';
      t += sqName(m.to);
      if (m.promo) t += '=' + m.promo;
    }
    const ns = apply(s, m);
    if (inCheck(ns)) t += legal(ns).length ? '+' : '#';
    return t;
  }

  /* ---------------- Evaluation ---------------- */
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
        0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
        -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
        -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
        0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
        20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    ke: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30,
         -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30,
         -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
  };

  // Score from the side-to-move's perspective.
  function evaluate(s) {
    const b = s.board;
    let score = 0, nonPawn = 0, wk = -1, bk = -1;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const t = p.toLowerCase(), white = p === p.toUpperCase();
      if (t === 'k') { if (white) wk = i; else bk = i; continue; }
      if (t !== 'p') nonPawn += VAL[t];
      const idx = white ? i : (7 - (i >> 3)) * 8 + (i & 7);
      const v = VAL[t] + PST[t][idx];
      score += white ? v : -v;
    }
    const kt = nonPawn <= 2600 ? PST.ke : PST.k;
    if (wk >= 0) score += kt[wk];
    if (bk >= 0) score -= kt[(7 - (bk >> 3)) * 8 + (bk & 7)];
    return s.turn === 'w' ? score : -score;
  }

  /* ---------------- Search ---------------- */
  const INF = 1e6, MATE = 30000, TIMEOUT = { timeout: true };
  let nodes = 0, deadline = Infinity;

  function order(moves, s) {
    const b = s.board;
    for (const m of moves) {
      const cap = b[m.to] ? VAL[b[m.to].toLowerCase()] : (m.flag === 'e' ? 100 : 0);
      m.o = cap ? 10 * cap - VAL[b[m.from].toLowerCase()] / 10 : 0;
      if (m.promo) m.o += 800;
    }
    moves.sort((x, y) => y.o - x.o);
  }

  function quiesce(s, alpha, beta, qd) {
    const stand = evaluate(s);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd <= 0) return alpha;
    const b = s.board;
    const caps = legal(s).filter(m => b[m.to] || m.flag === 'e' || m.promo);
    order(caps, s);
    for (const m of caps) {
      const sc = -quiesce(apply(s, m), -beta, -alpha, qd - 1);
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function search(s, depth, alpha, beta, ply) {
    if (((++nodes) & 2047) === 0 && Date.now() > deadline) throw TIMEOUT;
    if (s.half >= 100 || insufficientMaterial(s)) return 0;
    if (depth <= 0) return quiesce(s, alpha, beta, 6);
    const moves = legal(s);
    if (!moves.length) return inCheck(s) ? -MATE + ply : 0;
    order(moves, s);
    let best = -INF;
    for (const m of moves) {
      const sc = -search(apply(s, m), depth - 1, -beta, -alpha, ply + 1);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  const LEVELS = {
    1: { depth: 1, noise: 500, random: 0.7, time: Infinity },  // Beginner: mostly random moves
    2: { depth: 1, noise: 250, time: Infinity },               // Easy
    3: { depth: 2, noise: 50, time: Infinity },                // Casual
    4: { depth: 4, noise: 0, time: 1500 },                     // Club
    5: { depth: 9, noise: 0, time: 3000 },                     // Master
  };

  function bestMove(s, level) {
    const cfg = LEVELS[level] || LEVELS[3];
    const moves = legal(s);
    if (moves.length <= 1) return moves[0] || null;
    if (cfg.random && Math.random() < cfg.random) return moves[Math.floor(Math.random() * moves.length)];
    nodes = 0;
    deadline = Date.now() + cfg.time;

    if (cfg.noise) {
      let best = null, bs = -Infinity;
      for (const m of moves) {
        const sc = -search(apply(s, m), cfg.depth - 1, -INF, INF, 1) + Math.random() * cfg.noise;
        if (sc > bs) { bs = sc; best = m; }
      }
      return best;
    }

    order(moves, s);
    let best = moves[0];
    try {
      for (let d = 1; d <= cfg.depth; d++) {
        let alpha = -INF, bestD = null;
        for (const m of moves) {
          const sc = -search(apply(s, m), d - 1, -INF, -alpha, 1);
          if (sc > alpha || !bestD) { alpha = Math.max(alpha, sc); bestD = m; }
        }
        best = bestD;
        moves.splice(moves.indexOf(bestD), 1);
        moves.unshift(bestD);
        if (alpha > MATE - 100) break;
      }
    } catch (e) {
      if (e !== TIMEOUT) throw e;
    }
    return best;
  }

  function perft(s, d) {
    if (d === 0) return 1;
    let n = 0;
    for (const m of legal(s)) n += perft(apply(s, m), d - 1);
    return n;
  }

  const api = {
    FILES, START_FEN, colorOf, sqName, parseFEN, initState, attacked, inCheck, legal, apply,
    positionKey, insufficientMaterial, san, bestMove, perft, LEVELS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chess = api;
})(typeof window !== 'undefined' ? window : globalThis);
