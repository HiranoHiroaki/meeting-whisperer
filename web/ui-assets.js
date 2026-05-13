export function preloadUiButtonImages() {
  const paths = [
    "./assets/images/shiranai_button_0.png",
    "./assets/images/shiranai_button_1.png",
    "./assets/images/shiranai_button_2.png",
    "./assets/images/kininaru_button_0.png",
    "./assets/images/kininaru_button_1.png",
    "./assets/images/kininaru_button_2.png",
  ];
  for (const src of paths) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }
}
