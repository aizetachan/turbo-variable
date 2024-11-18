# Advanced Variable Manager for Figma

<!-- Logo -->
<p align="center">
  <img src="logo.png" alt="Turbo Variables logo"/>
</p>
<h1 align="center">Figma Plugin: Advanced Variable Manager</h1>

<!-- Slogan -->
<p align="center">
   Seamlessly manage and apply variables and styles from multiple libraries in Figma!
</p>

<!-- Badges -->
<p align="center">

  <!-- GitHub Badges -->
  <img src="https://raw.githubusercontent.com/TheSpawnProject/TheSpawnLanguage/master/.github/assets/github-badge.png" height="20px"/>
  <a href="https://github.com/aizetachan/turbo-variable/commits/main">
    <img src="https://img.shields.io/github/last-commit/aizetachan/turbo-variable"/>
  </a>
  <a href="https://github.com/aizetachan/turbo-variable/issues">
    <img src="https://img.shields.io/github/issues/aizetachan/turbo-variable"/>
  </a>

</p>

# 🗝 Key Features

1. **Access Variables Across Libraries:** Easily browse and apply variables from different libraries within your Figma document.

2. **Group Variables and Styles:** Variables and styles are grouped by library and collection for better organization and faster access.

3. **Dynamic Filtering:** Quickly find variables and styles using the search filter and collection selector.

4. **Apply Variables and Styles Effortlessly:** Apply selected variables or styles directly to fills and strokes with a single click.

5. **Detailed Tooltips:** Hover over variables and styles to see full names, including collection paths, ensuring you select the right asset.

6. **Intuitive UI with React and Vite:** Built with using modern technologies like React and Vite for a smooth and responsive user experience.

# 💻 How to Get Started

### Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/aizetachan/turbo-variable.git
   cd turbo-variable
   ```
   
2. **Install Dependencies:**

   ```bash
   yarn install
   ```
   
3. **Start the Development Server:**

   ```bash
    yarn dev
    ```
   
4. **Open Figma and Load the Plugin:**

    - Go to the Figma desktop app.
    - Open the Plugins panel.
    - Click on the `Create new plugin` button.
    - Select the `Development` tab.
    - Click on the `Link existing plugin` button.
    - Select the `manifest.json` file from the `turbo-variable\dist` directory.
    - Click on the `Link` button to load the plugin.

# 🖱 Developing

### 🕸 Project Structure

- **`src`**: Contains the source code for the plugin.
  - **`ui`**: Contains the React components for the plugin UI.
  - **`plugin`**: Contains the main plugin code and event handlers.

### 🛠 Building

- **Development Build:**

  ```bash
  yarn dev
  ```

This command will watch for changes in the `src` directory and rebuild the plugin automatically.
  
- **Production Build:**

  ```bash
  yarn build
  ```

This will generate the production-ready files in the dist folder.

# 📦 Publishing

Follow these steps to publish your plugin to the Figma Community:

- Build the plugin using the `yarn build` command.
- In Figma, go to the `Plugins` > `Development` > `Publish Plugin` menu.
- Follow the prompts to publish your plugin.

For more information, refer to the official Figma documentation on [publishing plugins](https://help.figma.com/hc/en-us/articles/360042293394-Publish-plugins-to-the-Figma-Community).

### 🛠 Technologies Used

- **React**: For building the plugin UI.
- **Vite**: For bundling the plugin code.
- **Figma Plugin API**: For interacting with Figma documents and assets.
- **TypeScript**: For type-checking and improved code quality.
- **SCSS Modules**: For styling the plugin components.


# 🚀 Features in Detail

### Grouping and Organization

- **Library Grouping**: Variables and styles are automatically grouped by their originating libraries, making it easier to navigate when working with multiple libraries.

- **Collection Selector**: Filter variables based on collections to quickly find the assets you need.

### Applying Variables and Styles

- **One-Click Application**: Apply variables or styles to selected elements in your design with a single click.

- **Fill and Stroke Actions**: Choose whether to apply the variable or style to the fill or stroke of an element.

### Tooltips and Accessibility

- **Detailed Tooltips**: Hover over items to see the full path, including the collection and group names, ensuring clarity when multiple variables or styles have similar names.

- **Responsive Design**: The plugin UI is designed to be intuitive and accessible, providing a seamless experience within Figma.

### Search and Filtering

- **Dynamic Search**: Use the search bar to filter variables and styles based on their names.

- **Collection Selector**: Choose a specific collection to narrow down the list of variables and styles.

# 🙏 Acknowledgements

- Inspired by the need to efficiently manage variables and styles across multiple libraries in Figma.

- Built using modern technologies like React and Vite for a responsive and intuitive user experience.