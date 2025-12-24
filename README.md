# KetchDraw

A free, open-source ChemDraw alternative built with JSME and RDKit.js. Draw molecular structures and see calculated properties in real-time.

## Features

- **JSME Molecule Editor**: Full-featured 2D molecular structure editor that works directly in the browser
- **Live Property Calculations**: Properties update instantly as you draw using RDKit.js
- **Structure Preview**: RDKit renders SVG previews of each molecule in the properties panel
- **Multiple Molecule Support**: Draw multiple disconnected fragments to see properties for each
- **Drug-likeness Highlighting**: Properties violating Lipinski's rules are highlighted in yellow/red
- **Collapsible Panel**: Maximize drawing space by collapsing the properties panel
- **Copy SMILES**: One-click copy of SMILES strings

## Calculated Properties

| Property | Description |
|----------|-------------|
| MW | Molecular Weight |
| cLogP | Calculated LogP (Crippen method) |
| TPSA | Topological Polar Surface Area |
| HBA | Hydrogen Bond Acceptors |
| HBD | Hydrogen Bond Donors |
| Fsp3 | Fraction of sp3 carbons |
| RotB | Rotatable Bonds |
| HAC | Heavy Atom Count |
| Hetero | Heteroatom Count |
| ArRings | Aromatic Ring Count |
| Stereo | Defined Stereocenters |
| Unspec | Unspecified Stereocenters |

## Usage

### GitHub Pages

1. Enable GitHub Pages in your repository settings
2. Set source to main branch
3. Access at `https://[username].github.io/Ketchdraw`

### Local Development

Simply open `index.html` in a modern web browser. No build step required.

For best results, serve via a local HTTP server:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve
```

Then visit `http://localhost:8000`

## Drawing Tips

- Click and drag to draw bonds
- Use the element buttons to change atom types
- Click on atoms/bonds to modify them
- Draw disconnected fragments for multiple molecules
- Use the Clear button to start fresh

## Drug-Likeness Rules (Lipinski's Rule of Five)

Properties are color-coded based on oral bioavailability guidelines:
- **Green**: Within guidelines
- **Yellow**: Approaching limits
- **Red**: Exceeds limits

| Property | Warning | Alert |
|----------|---------|-------|
| MW | >450 | >500 |
| cLogP | >4 | >5 |
| TPSA | >120 | >140 |
| HBA | >8 | >10 |
| HBD | >4 | >5 |
| RotB | >7 | >10 |

## Technology Stack

- [JSME](https://jsme-editor.github.io/) - JavaScript Molecular Editor
- [RDKit.js](https://github.com/rdkit/rdkit-js) - Cheminformatics toolkit for JavaScript

## Why JSME instead of Ketcher?

Ketcher is an excellent editor but requires a React build toolchain and cannot be easily embedded in a static HTML page. JSME was designed specifically for easy web embedding and works directly from CDN without any build step - perfect for GitHub Pages.

## License

MIT License - free to use and modify.

## Acknowledgments

- Peter Ertl and Bruno Bienfait for JSME
- RDKit community for the JavaScript/WebAssembly port
