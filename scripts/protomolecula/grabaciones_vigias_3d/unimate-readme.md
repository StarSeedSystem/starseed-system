<!-- Grabado el 2026-10-20 de https://raw.githubusercontent.com/Friedrich-M/UniMate/main/README.md (HTTP 200). Recortado: cabecera, noticias, «Inference» (los comandos `hf download` y `python -m unimate.inference.sample`, tal cual) y la licencia; el resto del README no se usa. -->
<h1 align="center">UniMate</h1>

<p align="center"><b>One Unified Model to Animate Diverse Skeletons</b></p>

<p align="center">
  <a href="https://linzhanmou.com/unimate/"><img alt="Project Page" src="https://img.shields.io/badge/Project_Page-6D28D9?style=for-the-badge&logo=githubpages&logoColor=white"></a>
  <a href="https://arxiv.org/abs/2609.05415"><img alt="arXiv" src="https://img.shields.io/badge/arXiv-2609.05415-B31B1B?style=for-the-badge&logo=arxiv&logoColor=white"></a>
  <a href="https://linzhanmou.com/unimate/interactive.html"><img alt="Interactive Demo" src="https://img.shields.io/badge/Interactive_Demo-0EA5E9?style=for-the-badge&logo=threedotjs&logoColor=white"></a>
  <a href="https://huggingface.co/Linzhan/UniMate"><img alt="Hugging Face Checkpoints" src="https://img.shields.io/badge/Checkpoints-FF9D00?style=for-the-badge&logo=huggingface&logoColor=000000"></a>
</p>

<p align="center">
  <a href="https://linzhanm.github.io/">Linzhan Mou</a> ·
  <a href="https://jiahuilei.com/">Jiahui Lei</a> ·
  <a href="https://frank-zy-dou.github.io/">Zhiyang Dou</a> ·
  <a href="https://chenyue-cai.com/">Chenyue Cai</a> ·
  <a href="https://chaoyuesong.github.io/">Chaoyue Song</a> ·
  <a href="https://www.cs.princeton.edu/~af/">Adam Finkelstein</a> ·
  <a href="https://www.cs.princeton.edu/~smr/">Szymon Rusinkiewicz</a>
</p>

<p align="center">Princeton · UC Berkeley · MIT · NTU</p>

<div align="center">
    <img src="assets/teaser.png" alt="UniMate teaser" width="100%">
</div>

---

## 🔥 News

- **[2026-10-05]** **Bring your own rig**: [`rig_preprocess`](data_process/rig_preprocess/) turns any rigged GLB / glTF / FBX, animated or not, into an asset UniMate can animate, with a review step for its joint labels and facing; the sampler takes dataset skeletons and your own assets by reference. [UniML3D](https://huggingface.co/datasets/Linzhan/UniML3D) adds training-ready features, canonical rest-pose meshes and generic / detailed captions. 🛠️
- **[2026-09-27]** Preview checkpoints are released at [HuggingFace](https://huggingface.co/Linzhan/UniMate); new checkpoints will be synced there. 📦
- **[2026-09-06]** The **training and inference code** is released. 🚀
- **[2026-08-30]** The [UniML3D dataset](https://huggingface.co/collections/Linzhan/unimate) and its [data-processing pipeline](data_process/) are released. 🚀
- **[2026-08-01]** Our [Interactive Demo](https://linzhanmou.com/unimate/interactive.html) is live — browse our animation results in 3D. 🎮
- **[2026-07-18]** UniMate is accepted to SIGGRAPH Asia 2026! 🎉

## 🎬 Inference

Given a rigged 3D asset and a text prompt, UniMate generates articulated motion for arbitrary skeletons in real time — with no per-skeleton retraining and no test-time optimization.

**1. Get a model.** Download a [released checkpoint](https://huggingface.co/Linzhan/UniMate) (configuration, normalization statistics, latest checkpoint), or use the output directory of your own training run:

```bash
hf download Linzhan/UniMate --repo-type model --local-dir outputs \
    --include "unimate_uniml3d_f60_v3/*.json" --include "unimate_uniml3d_f60_v3/*.npy" \
    --include "unimate_uniml3d_f60_v3/checkpoints/checkpoint_step_150000.pt"
```

**2a. Animate a dataset skeleton.** Download [UniML3D](https://huggingface.co/datasets/Linzhan/UniML3D) into `dataset/` (≈ 88 GB; its [dataset card](https://huggingface.co/datasets/Linzhan/UniML3D#download) shows smaller partial downloads):

```bash
hf download Linzhan/UniML3D --repo-type dataset --local-dir dataset
```

```bash
python -m unimate.inference.sample --exp_dir outputs/unimate_uniml3d_f60_v3 \
    --test_cases_json assets/examples/examples.json --num_repetitions 3 --output_dir outputs/samples/examples
# drive each skeleton's canonical mesh: one animated GLB + FBX per motion
# (Truebones meshes are not distributed; SKIP_INVALID=1 skips motions without a mesh)
SKIP_INVALID=1 bash scripts/run_animate_motion.sh outputs/samples/examples
```

**2b. Animate your own rigged asset.** [`rig_preprocess`](data_process/rig_preprocess/README.md) turns a rigged GLB / glTF / FBX, animated or not, into an asset directory that `--asset` takes. It labels the joints with an LLM and stops so you can review the labels and the facing pair before building, since the model is conditioned on both; its [guide](data_process/rig_preprocess/README.md) walks through the review and every option. Three assets processed this way are in [`assets/examples`](assets/examples): a Unitree Go2 quadruped, an eagle and a shark:

```bash
python -m unimate.inference.sample --exp_dir outputs/unimate_uniml3d_f60_v3 --asset assets/examples/unitree_go2 \
    --prompt "An object trots forward." "An object rears up on its hind legs." --output_dir outputs/samples/custom
```

## ⚖️ License

The code in this repository is released under the [MIT License](LICENSE). The released checkpoints are under [CC BY-NC 4.0](https://huggingface.co/Linzhan/UniMate/blob/main/LICENSE); see the [model card](https://huggingface.co/Linzhan/UniMate) for details.

The datasets remain governed by the licenses of their original sources: the [Mixamo](https://www.mixamo.com/) assets by Adobe's Mixamo terms of use, the [Objaverse-XL](https://objaverse.allenai.org/) assets by the license attached to each original object, and the Truebones ZOO motions by [Truebones](https://truebones.com)' commercial license. Please review and comply with the respective source licenses before using the data.

